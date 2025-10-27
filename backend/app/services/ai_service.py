"""
AI Service
Configuration analysis using Google Gemini
"""

import json
import structlog
import google.generativeai as genai
from typing import Optional
from app.settings import get_settings

logger = structlog.get_logger()
settings = get_settings()


class AIService:
    """Service for AI-powered configuration analysis"""

    def __init__(self):
        """Initialize AI service with Gemini API"""
        if not settings.gemini_api_key:
            logger.warning("Gemini API key not configured")
            self.enabled = False
            return

        try:
            genai.configure(api_key=settings.gemini_api_key)
            self.model = genai.GenerativeModel(settings.gemini_model)
            self.enabled = True
            logger.info("AI service initialized", model=settings.gemini_model)
        except Exception as e:
            logger.error("Failed to initialize AI service", error=str(e))
            self.enabled = False

    def analyze_config(self, config_text: str, device_hostname: str) -> dict:
        """
        Analyze SRX configuration for issues and recommendations

        Args:
            config_text: Full device configuration
            device_hostname: Device hostname for context

        Returns:
            dict: Analysis results with findings and recommendations
        """
        if not self.enabled:
            return {
                "success": False,
                "error": "AI analysis is not enabled or configured"
            }

        try:
            prompt = f"""
You are a Juniper SRX firewall expert. Analyze this configuration for device "{device_hostname}".

Provide your analysis as valid JSON with this EXACT structure (limit to top 5 findings):
{{
  "summary": "Brief 2-sentence overview",
  "severity": "low|medium|high|critical",
  "junos_version": "version from config",
  "security_score": 75,
  "compliance_score": 80,
  "findings": [
    {{
      "category": "security",
      "severity": "high",
      "title": "Short title (max 10 words)",
      "description": "Brief description (max 50 words)",
      "recommendation": "Brief fix (max 30 words)",
      "commands": [
        "delete security ike proposal weak-proposal",
        "set security ike proposal strong-proposal authentication-algorithm sha-256"
      ]
    }}
  ]
}}

IMPORTANT: For each finding, include a "commands" array with the exact JunOS commands to fix the issue.
- Use proper JunOS syntax (set/delete/deactivate)
- Keep commands minimal (2-5 commands per fix)
- Commands should be copy-paste ready

Configuration (first 20000 chars):
{config_text[:20000]}

Return ONLY valid JSON. No markdown blocks, no extra text.
"""

            logger.info("Analyzing configuration", hostname=device_hostname, size=len(config_text))

            from google.generativeai.types import HarmCategory, HarmBlockThreshold

            safety_settings = [
                {
                    "category": HarmCategory.HARM_CATEGORY_HARASSMENT,
                    "threshold": HarmBlockThreshold.BLOCK_NONE
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    "threshold": HarmBlockThreshold.BLOCK_NONE
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    "threshold": HarmBlockThreshold.BLOCK_NONE
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    "threshold": HarmBlockThreshold.BLOCK_NONE
                }
            ]

            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,  # Low temperature for consistent analysis
                    max_output_tokens=8192,
                    response_mime_type="application/json"
                ),
                safety_settings=safety_settings
            )

            # Check if response was blocked
            if not response.parts:
                finish_reason = response.candidates[0].finish_reason if response.candidates else "unknown"
                logger.error("AI response blocked", finish_reason=finish_reason)
                return {
                    "success": False,
                    "error": f"AI response was blocked (finish_reason: {finish_reason})"
                }

            # Parse response
            analysis_text = response.text.strip()

            # Remove markdown code blocks if present
            if analysis_text.startswith('```json'):
                analysis_text = analysis_text[7:]
            if analysis_text.startswith('```'):
                analysis_text = analysis_text[3:]
            if analysis_text.endswith('```'):
                analysis_text = analysis_text[:-3]
            analysis_text = analysis_text.strip()

            analysis = json.loads(analysis_text)

            logger.info(
                "Analysis completed",
                hostname=device_hostname,
                findings=len(analysis.get('findings', [])),
                severity=analysis.get('severity')
            )

            return {
                "success": True,
                "analysis": analysis
            }

        except json.JSONDecodeError as e:
            logger.error("Failed to parse AI response", error=str(e), response=analysis_text[:500])
            return {
                "success": False,
                "error": "Failed to parse AI response",
                "raw_response": analysis_text[:1000]
            }
        except Exception as e:
            logger.error("AI analysis failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }

    def chat_stream(self, message: str, device_context: Optional[dict] = None):
        """
        Stream chat responses about device configuration and issues

        Args:
            message: User's chat message/question
            device_context: Optional context (config, health data, analysis)

        Yields:
            str: Chunks of the AI response as they're generated
        """
        if not self.enabled:
            yield "AI service is not enabled or configured."
            return

        try:
            # Build context-aware prompt
            context_info = ""
            if device_context:
                if device_context.get('hostname'):
                    context_info += f"\nDevice: {device_context['hostname']}"
                if device_context.get('model'):
                    context_info += f"\nModel: {device_context['model']}"
                if device_context.get('junos_version'):
                    context_info += f"\nJunOS: {device_context['junos_version']}"
                if device_context.get('config_snippet'):
                    context_info += f"\n\nConfiguration excerpt:\n{device_context['config_snippet'][:5000]}"
                if device_context.get('health_status'):
                    context_info += f"\n\nHealth Status: {device_context['health_status']}"
                if device_context.get('analysis_summary'):
                    context_info += f"\n\nRecent Analysis: {device_context['analysis_summary']}"

            prompt = f"""
You are a helpful Juniper SRX firewall expert assistant. Answer the user's question clearly and concisely.
{context_info}

User Question: {message}

Provide a clear, practical answer. If suggesting configuration changes, include exact JunOS commands.
If the question is about security best practices, reference current standards.
"""

            logger.info("Starting chat stream", message_length=len(message), has_context=bool(device_context))

            # Use streaming generate_content
            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.7,  # Slightly higher for natural conversation
                    max_output_tokens=2048
                ),
                stream=True
            )

            # Stream the response chunks
            for chunk in response:
                if chunk.text:
                    yield chunk.text

            logger.info("Chat stream completed")

        except Exception as e:
            logger.error("Chat stream failed", error=str(e))
            yield f"\n\nError: {str(e)}"

    def generate_config(self, task_description: str, device_context: Optional[dict] = None) -> dict:
        """
        Generate JunOS configuration based on user's description

        Args:
            task_description: What the user wants to configure (e.g., "add site-to-site VPN")
            device_context: Optional device info for context-aware generation

        Returns:
            dict: Generated configuration with commands and explanation
        """
        if not self.enabled:
            return {
                "success": False,
                "error": "AI service is not enabled or configured"
            }

        try:
            # Build context
            context_info = ""
            if device_context:
                if device_context.get('hostname'):
                    context_info += f"\nDevice: {device_context['hostname']}"
                if device_context.get('model'):
                    context_info += f"\nModel: {device_context['model']}"
                if device_context.get('junos_version'):
                    context_info += f"\nJunOS Version: {device_context['junos_version']}"
                if device_context.get('current_config_snippet'):
                    context_info += f"\n\nCurrent Config Excerpt:\n{device_context['current_config_snippet'][:3000]}"

            prompt = f"""
You are a Juniper SRX firewall expert. Generate complete, production-ready JunOS configuration commands for this task.
{context_info}

User Request: {task_description}

Provide your response as valid JSON with this structure:
{{
  "summary": "Brief 1-2 sentence explanation of what this configuration does",
  "commands": [
    "set security zones security-zone trust address-book address host1 10.0.1.10/32",
    "set security policies from-zone trust to-zone untrust policy allow-outbound match source-address host1"
  ],
  "explanation": "Detailed step-by-step explanation of each command and why it's needed",
  "warnings": [
    "This will allow all outbound traffic from 10.0.1.10",
    "Ensure the trust zone exists before applying"
  ],
  "prerequisites": [
    "Verify that security zones 'trust' and 'untrust' are configured",
    "Confirm that interfaces are assigned to the correct zones"
  ]
}}

IMPORTANT Guidelines:
1. Use proper JunOS syntax (set/delete commands)
2. Include all necessary configuration (zones, policies, NAT, routing as needed)
3. Follow Juniper best practices
4. Be specific with IP addresses, ports, protocols
5. Include security considerations
6. Commands should be ready to copy-paste
7. If the request is vague, make reasonable assumptions and document them in warnings

Return ONLY valid JSON, no markdown blocks.
"""

            logger.info("Generating configuration", task=task_description)

            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3,  # Lower temperature for more predictable configs
                    max_output_tokens=4096
                )
            )

            # Parse response
            config_text = response.text.strip()

            # Clean markdown if present
            if config_text.startswith('```json'):
                config_text = config_text[7:-3]
            elif config_text.startswith('```'):
                config_text = config_text[3:-3]
            config_text = config_text.strip()

            config = json.loads(config_text)

            logger.info(
                "Configuration generated",
                commands=len(config.get('commands', [])),
                warnings=len(config.get('warnings', []))
            )

            return {
                "success": True,
                "config": config
            }

        except json.JSONDecodeError as e:
            logger.error("Failed to parse AI config generation", error=str(e))
            return {
                "success": False,
                "error": "Failed to parse AI response",
                "raw_response": config_text[:1000]
            }
        except Exception as e:
            logger.error("Config generation failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }

    def compare_configs(self, old_config: str, new_config: str, device_hostname: str) -> dict:
        """
        Compare two configurations and highlight important changes

        Args:
            old_config: Previous configuration
            new_config: New configuration
            device_hostname: Device hostname

        Returns:
            dict: Comparison results with change analysis
        """
        if not self.enabled:
            return {
                "success": False,
                "error": "AI analysis is not enabled"
            }

        try:
            prompt = f"""
You are a Juniper SRX expert. Compare these two configurations for device "{device_hostname}"
and identify significant changes, their impact, and any risks.

Analyze:
1. **Security Changes**: Policy additions/removals, ACL changes
2. **Network Changes**: Routing, interfaces, VLANs
3. **Service Changes**: NAT, VPN, services
4. **Risk Assessment**: Potential impact of each change
5. **Recommendations**: Suggested reviews or tests before deployment

Respond in JSON format:
{{
  "summary": "Brief overview of changes",
  "risk_level": "low|medium|high|critical",
  "changes": [
    {{
      "category": "security|network|service|system",
      "type": "addition|modification|removal",
      "description": "What changed",
      "impact": "Potential impact",
      "risk": "low|medium|high|critical",
      "recommendation": "Action to take"
    }}
  ]
}}

OLD CONFIG:
```
{old_config[:25000]}
```

NEW CONFIG:
```
{new_config[:25000]}
```

Respond ONLY with valid JSON, no markdown.
"""

            response = self.model.generate_content(prompt)
            analysis_text = response.text.strip()

            # Clean response
            if analysis_text.startswith('```json'):
                analysis_text = analysis_text[7:-3]
            elif analysis_text.startswith('```'):
                analysis_text = analysis_text[3:-3]

            analysis = json.loads(analysis_text.strip())

            return {
                "success": True,
                "comparison": analysis
            }

        except Exception as e:
            logger.error("Config comparison failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }

    def analyze_upgrade_readiness(self, device_info: dict, target_version: str, health_data: Optional[dict] = None) -> dict:
        """
        AI analyzes if device is ready for firmware upgrade

        Args:
            device_info: Device information (hostname, model, current_version, etc.)
            target_version: Target JunOS version
            health_data: Optional current health check results

        Returns:
            dict: Readiness analysis with recommendations
        """
        if not self.enabled:
            return {
                "success": False,
                "error": "AI analysis is not enabled"
            }

        try:
            health_context = ""
            if health_data:
                health_context = f"""
Current Device Health:
- Storage Used: {health_data.get('storage', 'Unknown')}
- Memory: {health_data.get('memory', 'Unknown')}
- CPU: {health_data.get('cpu', 'Unknown')}
- Active Alarms: {health_data.get('alarms', 'Unknown')}
- Tunnel Status: {health_data.get('tunnels', 'Unknown')}
"""

            prompt = f"""
You are a Juniper SRX firmware upgrade expert. Analyze if this device is ready for upgrade.

Device Information:
- Hostname: {device_info.get('hostname')}
- Model: {device_info.get('model')}
- Current JunOS Version: {device_info.get('current_version')}
- Target JunOS Version: {target_version}
{health_context}

Provide your analysis as JSON:
{{
  "ready": true/false,
  "confidence": "high|medium|low",
  "overall_risk": "low|medium|high|critical",
  "summary": "2-3 sentence assessment",
  "checks": [
    {{
      "category": "storage|memory|version_compatibility|known_issues|health",
      "status": "pass|warning|fail",
      "message": "Brief explanation",
      "recommendation": "Action if needed"
    }}
  ],
  "prerequisites": [
    "List any required actions before upgrade"
  ],
  "estimated_downtime": "Estimated time in minutes",
  "rollback_plan": "Brief rollback procedure"
}}

IMPORTANT:
- Check version compatibility (e.g., can't skip major versions)
- Verify sufficient storage (typically need 2-3x the image size)
- Flag any known issues with this version path
- Consider device criticality

Return ONLY valid JSON, no markdown.
"""

            logger.info("Analyzing upgrade readiness",
                       hostname=device_info.get('hostname'),
                       target_version=target_version)

            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.2,  # Low temperature for consistent analysis
                    max_output_tokens=4096
                )
            )

            analysis_text = response.text.strip()

            # Clean markdown
            if analysis_text.startswith('```json'):
                analysis_text = analysis_text[7:-3]
            elif analysis_text.startswith('```'):
                analysis_text = analysis_text[3:-3]
            analysis_text = analysis_text.strip()

            analysis = json.loads(analysis_text)

            logger.info("Upgrade readiness analysis completed",
                       hostname=device_info.get('hostname'),
                       ready=analysis.get('ready'),
                       risk=analysis.get('overall_risk'))

            return {
                "success": True,
                "analysis": analysis
            }

        except json.JSONDecodeError as e:
            logger.error("Failed to parse readiness analysis", error=str(e))
            return {
                "success": False,
                "error": "Failed to parse AI response"
            }
        except Exception as e:
            logger.error("Upgrade readiness analysis failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }

    def generate_upgrade_plan(self, device_info: dict, target_version: str, firmware_path: str) -> dict:
        """
        Generate detailed upgrade procedure with AI

        Args:
            device_info: Device information
            target_version: Target JunOS version
            firmware_path: Path to firmware file

        Returns:
            dict: Detailed upgrade plan with commands
        """
        if not self.enabled:
            return {
                "success": False,
                "error": "AI analysis is not enabled"
            }

        try:
            prompt = f"""
You are a Juniper SRX upgrade specialist. Generate a detailed, step-by-step upgrade procedure.

Device Information:
- Hostname: {device_info.get('hostname')}
- Model: {device_info.get('model')}
- Current Version: {device_info.get('current_version')}
- Target Version: {target_version}
- Firmware File: {firmware_path}

Generate comprehensive upgrade plan as JSON:
{{
  "summary": "Brief overview of upgrade procedure",
  "estimated_duration": "Total time in minutes",
  "steps": [
    {{
      "phase": "pre-upgrade|upload|install|reboot|post-upgrade",
      "step_number": 1,
      "description": "What this step does",
      "commands": [
        "show system storage",
        "request system snapshot slice alternate"
      ],
      "expected_output": "What to look for",
      "estimated_time": "Time for this step",
      "critical": true/false
    }}
  ],
  "validation_checks": [
    {{
      "check": "Verify version",
      "command": "show version",
      "expected": "What to verify"
    }}
  ],
  "rollback_procedure": [
    "Step-by-step rollback if needed"
  ],
  "warnings": [
    "Important cautions"
  ]
}}

IMPORTANT:
- Include snapshot creation
- Include pre-upgrade config backup
- Use commit confirmed for safety
- Include post-upgrade validation
- Provide rollback steps

Return ONLY valid JSON, no markdown.
"""

            logger.info("Generating upgrade plan",
                       hostname=device_info.get('hostname'),
                       target=target_version)

            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,  # Very low for procedural accuracy
                    max_output_tokens=6144
                )
            )

            plan_text = response.text.strip()

            # Clean markdown
            if plan_text.startswith('```json'):
                plan_text = plan_text[7:-3]
            elif plan_text.startswith('```'):
                plan_text = plan_text[3:-3]
            plan_text = plan_text.strip()

            plan = json.loads(plan_text)

            logger.info("Upgrade plan generated",
                       hostname=device_info.get('hostname'),
                       steps=len(plan.get('steps', [])))

            return {
                "success": True,
                "plan": plan
            }

        except json.JSONDecodeError as e:
            logger.error("Failed to parse upgrade plan", error=str(e))
            return {
                "success": False,
                "error": "Failed to parse AI response"
            }
        except Exception as e:
            logger.error("Upgrade plan generation failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }

    def analyze_upgrade_result(self, pre_upgrade_data: dict, post_upgrade_data: dict, device_hostname: str) -> dict:
        """
        Compare pre/post upgrade state and recommend proceed or rollback

        Args:
            pre_upgrade_data: Pre-upgrade health and config data
            post_upgrade_data: Post-upgrade health and config data
            device_hostname: Device hostname

        Returns:
            dict: Analysis with recommendation to proceed or rollback
        """
        if not self.enabled:
            return {
                "success": False,
                "error": "AI analysis is not enabled"
            }

        try:
            prompt = f"""
You are a Juniper SRX upgrade validation expert. Compare pre and post-upgrade states.

Device: {device_hostname}

PRE-UPGRADE STATE:
```
Version: {pre_upgrade_data.get('version')}
Alarms: {pre_upgrade_data.get('alarms', 'None')}
Storage: {pre_upgrade_data.get('storage')}
Interfaces: {pre_upgrade_data.get('interfaces_up', 'Unknown')} up
Tunnels: {pre_upgrade_data.get('tunnels', 'Unknown')}
```

POST-UPGRADE STATE:
```
Version: {post_upgrade_data.get('version')}
Alarms: {post_upgrade_data.get('alarms', 'None')}
Storage: {post_upgrade_data.get('storage')}
Interfaces: {post_upgrade_data.get('interfaces_up', 'Unknown')} up
Tunnels: {post_upgrade_data.get('tunnels', 'Unknown')}
Boot Time: {post_upgrade_data.get('boot_time')}
```

Analyze the upgrade and provide recommendation as JSON:
{{
  "recommendation": "proceed|rollback|investigate",
  "confidence": "high|medium|low",
  "success": true/false,
  "summary": "2-3 sentence assessment",
  "issues": [
    {{
      "severity": "critical|high|medium|low",
      "category": "version|alarms|connectivity|services",
      "description": "Issue description",
      "impact": "Potential impact"
    }}
  ],
  "validations": [
    {{
      "check": "Version upgraded correctly",
      "status": "pass|fail|warning",
      "details": "Explanation"
    }}
  ],
  "next_steps": [
    "Recommended actions"
  ]
}}

IMPORTANT:
- Recommend ROLLBACK if critical services are down
- Recommend PROCEED only if all critical checks pass
- Recommend INVESTIGATE if minor issues need attention

Return ONLY valid JSON, no markdown.
"""

            logger.info("Analyzing upgrade result", hostname=device_hostname)

            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4096
                )
            )

            result_text = response.text.strip()

            # Clean markdown
            if result_text.startswith('```json'):
                result_text = result_text[7:-3]
            elif result_text.startswith('```'):
                result_text = result_text[3:-3]
            result_text = result_text.strip()

            result = json.loads(result_text)

            logger.info("Upgrade result analyzed",
                       hostname=device_hostname,
                       recommendation=result.get('recommendation'),
                       success=result.get('success'))

            return {
                "success": True,
                "analysis": result
            }

        except json.JSONDecodeError as e:
            logger.error("Failed to parse upgrade result analysis", error=str(e))
            return {
                "success": False,
                "error": "Failed to parse AI response"
            }
        except Exception as e:
            logger.error("Upgrade result analysis failed", error=str(e))
            return {
                "success": False,
                "error": str(e)
            }
