/**
 * Device Detail Page
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { devicesApi, Device, Backup, ConfigAnalysis, Job, FirmwareVersion, UpgradeReadiness, UpgradePlan } from '../../lib/api';
import { formatPhoenixTime, getTimezoneAbbr } from '../../lib/dateUtils';

export default function DeviceDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [device, setDevice] = useState<Device | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ConfigAnalysis | null>(null);
  const [analyzingConfig, setAnalyzingConfig] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showConfigWizard, setShowConfigWizard] = useState(false);
  const [configDescription, setConfigDescription] = useState('');
  const [generatedConfig, setGeneratedConfig] = useState<any>(null);
  const [generatingConfig, setGeneratingConfig] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);

  // Firmware upgrade state
  const [showFirmwareModal, setShowFirmwareModal] = useState(false);
  const [firmwareList, setFirmwareList] = useState<FirmwareVersion[]>([]);
  const [selectedFirmware, setSelectedFirmware] = useState<string>('');
  const [readinessCheck, setReadinessCheck] = useState<UpgradeReadiness | null>(null);
  const [upgradePlan, setUpgradePlan] = useState<UpgradePlan | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [initiatingUpgrade, setInitiatingUpgrade] = useState(false);

  useEffect(() => {
    if (id) {
      loadDevice();
      loadBackups();
      loadJobs();
    }
  }, [id]);

  const loadDevice = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await devicesApi.get(Number(id));
      setDevice(data);
    } catch (err) {
      setError('Failed to load device details');
      console.error('Error loading device:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const data = await devicesApi.backups(Number(id));
      setBackups(data);
    } catch (err) {
      console.error('Error loading backups:', err);
    }
  };

  const loadJobs = async () => {
    try {
      const data = await devicesApi.jobs(Number(id));
      setJobs(data);
    } catch (err) {
      console.error('Error loading jobs:', err);
    }
  };

  const handleBackup = async () => {
    if (!device) return;
    if (confirm(`Start backup for ${device.hostname}?`)) {
      try {
        await devicesApi.backup(device.id);
        alert(`Backup queued for ${device.hostname}. Refresh the page in a moment to see the new backup.`);
        // Reload backups after a delay to allow the job to complete
        setTimeout(() => {
          loadBackups();
          loadDevice();
        }, 5000);
      } catch (error) {
        alert('Error queuing backup');
      }
    }
  };

  const handleHealthCheck = async () => {
    if (!device) return;
    if (confirm(`Run health check on ${device.hostname}?`)) {
      try {
        await devicesApi.healthCheck(device.id);
        alert(`Health check queued for ${device.hostname}`);
      } catch (error) {
        alert('Error queuing health check');
      }
    }
  };

  const handleAnalyzeConfig = async () => {
    if (!device) return;
    if (confirm(`Analyze configuration for ${device.hostname}? This may take 10-30 seconds.`)) {
      try {
        setAnalyzingConfig(true);
        setAnalysis(null);
        const result = await devicesApi.analyze(device.id);
        setAnalysis(result);
      } catch (error: any) {
        alert(error.response?.data?.detail || 'Error analyzing configuration');
      } finally {
        setAnalyzingConfig(false);
      }
    }
  };

  const handleSendChat = async () => {
    if (!device || !chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    // Add user message
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      // Call streaming API
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/devices/${device.id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          include_config: false,
          include_health: true
        })
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      // Add empty assistant message that we'll update
      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          assistantMessage += chunk;

          // Update the last message (assistant's response)
          setChatMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: assistantMessage };
            return updated;
          });
        }
      }
    } catch (error: any) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to get response'}`
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGenerateConfig = async () => {
    if (!device || !configDescription.trim()) return;

    setGeneratingConfig(true);
    setGeneratedConfig(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/devices/${device.id}/generate-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_description: configDescription,
          include_current_config: false
        })
      });

      if (!response.ok) {
        throw new Error('Config generation failed');
      }

      const result = await response.json();
      setGeneratedConfig(result.generated_config);
    } catch (error: any) {
      alert(`Error: ${error.message || 'Failed to generate configuration'}`);
    } finally {
      setGeneratingConfig(false);
    }
  };

  // Firmware management handlers
  const handleOpenFirmwareModal = async () => {
    setShowFirmwareModal(true);
    setReadinessCheck(null);
    setUpgradePlan(null);
    setSelectedFirmware('');

    try {
      const firmware = await devicesApi.listFirmware();
      setFirmwareList(firmware);
    } catch (error) {
      console.error('Error loading firmware:', error);
      alert('Failed to load firmware list');
    }
  };

  const handleCheckReadiness = async () => {
    if (!device || !selectedFirmware) return;

    setCheckingReadiness(true);
    setReadinessCheck(null);

    try {
      const result = await devicesApi.checkUpgradeReadiness(device.id, selectedFirmware);
      setReadinessCheck(result);
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.detail || error.message || 'Failed to check readiness'}`);
    } finally {
      setCheckingReadiness(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!device || !selectedFirmware) return;

    setGeneratingPlan(true);
    setUpgradePlan(null);

    try {
      const result = await devicesApi.generateUpgradePlan(device.id, selectedFirmware);
      setUpgradePlan(result);
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.detail || error.message || 'Failed to generate plan'}`);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleInitiateUpgrade = async () => {
    if (!device || !selectedFirmware) return;

    const confirmText = `⚠️  FIRMWARE UPGRADE CONFIRMATION

Device: ${device.hostname}
Current Version: ${device.junos_version || 'Unknown'}
Target Version: ${selectedFirmware}

WARNING:
• Device will REBOOT during upgrade
• Estimated time: 15-20 minutes
• Device will be UNAVAILABLE during upgrade
• Pre/post-upgrade backups will be created
• AI will validate upgrade success

Do you want to proceed?`;

    if (!confirm(confirmText)) return;

    setInitiatingUpgrade(true);

    try {
      const result = await devicesApi.initiateUpgrade(device.id, selectedFirmware);
      alert(`✅ Firmware upgrade initiated!\n\nTask ID: ${result.task_id}\n\nThe device will reboot. Monitor progress in the Jobs section below.`);
      setShowFirmwareModal(false);

      // Refresh jobs after a delay
      setTimeout(() => {
        loadJobs();
      }, 2000);
    } catch (error: any) {
      alert(`❌ Error: ${error.response?.data?.detail || error.message}`);
    } finally {
      setInitiatingUpgrade(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading device...</div>;
  }

  if (error || !device) {
    return (
      <div className="container">
        <div className="error">
          {error || 'Device not found'}
        </div>
        <Link href="/devices">← Back to Devices</Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{device.hostname} - SRX Fleet Manager</title>
      </Head>

      <div className="container">
        <nav>
          <Link href="/devices">← Back to Devices</Link>
          <Link href="/jobs">Jobs</Link>
        </nav>

        <header>
          <h1>{device.hostname}</h1>
          <div className="status-badges">
            <span className={`badge ${device.enabled ? 'badge-success' : 'badge-error'}`}>
              {device.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className="badge badge-info">{device.region || 'Unknown Region'}</span>
            <span className="badge badge-secondary">🕐 {getTimezoneAbbr()}</span>
          </div>
        </header>

        <div className="actions">
          <button className="button" onClick={handleBackup}>
            Backup Configuration
          </button>
          <button className="button button-secondary" onClick={handleHealthCheck}>
            Health Check
          </button>
          <button
            className="button button-ai"
            onClick={handleAnalyzeConfig}
            disabled={analyzingConfig}
          >
            {analyzingConfig ? 'Analyzing...' : '🤖 Analyze Configuration'}
          </button>
          <button
            className="button button-chat"
            onClick={() => setShowChatModal(true)}
          >
            💬 Chat with AI
          </button>
          <button
            className="button button-wizard"
            onClick={() => setShowConfigWizard(true)}
          >
            ⚙️ Generate Config
          </button>
          <button
            className="button button-firmware"
            onClick={handleOpenFirmwareModal}
          >
            🚀 Firmware Upgrade
          </button>
        </div>

        <div className="info-grid">
          <section className="card">
            <h2>Network Information</h2>
            <table className="detail-table">
              <tbody>
                <tr>
                  <th>Management IP</th>
                  <td><code>{device.mgmt_ip}</code></td>
                </tr>
                <tr>
                  <th>Subnet</th>
                  <td><code>{device.subnet || '-'}</code></td>
                </tr>
                <tr>
                  <th>WAN Type</th>
                  <td>{device.wan_type || '-'}</td>
                </tr>
                <tr>
                  <th>ISP Provider</th>
                  <td>{device.isp_provider || '-'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Location</h2>
            <table className="detail-table">
              <tbody>
                <tr>
                  <th>Region</th>
                  <td>{device.region || '-'}</td>
                </tr>
                <tr>
                  <th>Site</th>
                  <td>{device.site || '-'}</td>
                </tr>
                <tr>
                  <th>City</th>
                  <td>{device.city || '-'}</td>
                </tr>
                <tr>
                  <th>State</th>
                  <td>{device.state || '-'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Device Details</h2>
            <table className="detail-table">
              <tbody>
                <tr>
                  <th>Model</th>
                  <td>{device.model || '-'}</td>
                </tr>
                <tr>
                  <th>Serial Number</th>
                  <td>{device.serial_number || '-'}</td>
                </tr>
                <tr>
                  <th>JunOS Version</th>
                  <td>{device.junos_version || '-'}</td>
                </tr>
                <tr>
                  <th>Entity</th>
                  <td>{device.entity || '-'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Status</h2>
            <table className="detail-table">
              <tbody>
                <tr>
                  <th>Last Seen</th>
                  <td>
                    {formatPhoenixTime(device.last_seen_at) || 'Never'}
                  </td>
                </tr>
                <tr>
                  <th>Last Backup</th>
                  <td>
                    {formatPhoenixTime(device.last_backup_at) || 'Never'}
                  </td>
                </tr>
                <tr>
                  <th>IT Technician</th>
                  <td>{device.it_technician || '-'}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <section className="card full-width">
          <h2>Backup History ({backups.length})</h2>
          {backups.length === 0 ? (
            <p className="no-data">No backups found. Click "Backup Configuration" to create your first backup.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Backup Time</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Git Commit</th>
                    <th>Triggered By</th>
                    <th>File Path</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.id}>
                      <td>{formatPhoenixTime(backup.backed_up_at)}</td>
                      <td>
                        <span className={`badge ${backup.backup_type === 'manual' ? 'badge-info' : 'badge-success'}`}>
                          {backup.backup_type}
                        </span>
                      </td>
                      <td>{(backup.size_bytes / 1024).toFixed(1)} KB</td>
                      <td>
                        <code className="commit-sha">{backup.git_commit_sha.substring(0, 8)}</code>
                      </td>
                      <td>{backup.triggered_by}</td>
                      <td className="file-path">{backup.file_path}</td>
                      <td>
                        <a
                          href={`http://localhost:8000/api/devices/${device.id}/backups/${backup.id}/content`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="action-link"
                        >
                          View
                        </a>
                        {' | '}
                        <a
                          href={`http://localhost:8000/api/devices/${device.id}/backups/${backup.id}/content`}
                          download={`${device.hostname}-${backup.git_commit_sha.substring(0, 8)}.conf`}
                          className="action-link"
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* AI Chat Modal */}
        {showChatModal && (
          <div className="modal-overlay" onClick={() => setShowChatModal(false)}>
            <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="chat-header">
                <h2>💬 Chat with AI - {device?.hostname}</h2>
                <button className="close-button" onClick={() => setShowChatModal(false)}>×</button>
              </div>

              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <div className="chat-welcome">
                    <p>Ask me anything about this device's configuration, security, or best practices!</p>
                    <p className="chat-examples">
                      Example questions:
                      <br/>• What are the main security concerns?
                      <br/>• How can I improve VPN security?
                      <br/>• What's the current device status?
                    </p>
                  </div>
                )}

                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`chat-message ${msg.role}`}>
                    <div className="message-role">{msg.role === 'user' ? 'You' : 'AI Assistant'}</div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="chat-message assistant">
                    <div className="message-role">AI Assistant</div>
                    <div className="message-content typing">Typing...</div>
                  </div>
                )}
              </div>

              <div className="chat-input-container">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Ask a question..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !chatLoading && handleSendChat()}
                  disabled={chatLoading}
                />
                <button
                  className="chat-send-button"
                  onClick={handleSendChat}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Config Generation Wizard */}
        {showConfigWizard && (
          <div className="modal-overlay" onClick={() => setShowConfigWizard(false)}>
            <div className="config-wizard-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wizard-header">
                <h2>⚙️ Configuration Generator - {device?.hostname}</h2>
                <button className="close-button" onClick={() => setShowConfigWizard(false)}>×</button>
              </div>

              <div className="wizard-content">
                {!generatedConfig ? (
                  <div className="wizard-input-section">
                    <p className="wizard-instructions">
                      Describe what you want to configure in natural language:
                    </p>
                    <textarea
                      className="config-description-input"
                      placeholder="Example: Add a security policy to allow HTTPS traffic from 10.0.1.0/24 to the internet"
                      value={configDescription}
                      onChange={(e) => setConfigDescription(e.target.value)}
                      rows={4}
                    />
                    <button
                      className="button button-primary"
                      onClick={handleGenerateConfig}
                      disabled={generatingConfig || !configDescription.trim()}
                    >
                      {generatingConfig ? 'Generating...' : '🤖 Generate Configuration'}
                    </button>
                  </div>
                ) : (
                  <div className="generated-config-display">
                    <div className="config-summary">
                      <h3>📋 Summary</h3>
                      <p>{generatedConfig.summary}</p>
                    </div>

                    <div className="config-commands">
                      <h3>💻 Commands ({generatedConfig.commands.length})</h3>
                      <pre className="commands-block">{generatedConfig.commands.join('\n')}</pre>
                      <button
                        className="button-small button-secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedConfig.commands.join('\n'));
                          alert('Commands copied!');
                        }}
                      >
                        📋 Copy Commands
                      </button>
                    </div>

                    {generatedConfig.warnings && generatedConfig.warnings.length > 0 && (
                      <div className="config-warnings">
                        <h3>⚠️ Warnings</h3>
                        <ul>
                          {generatedConfig.warnings.map((w: string, i: number) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="wizard-actions">
                      <button
                        className="button button-secondary"
                        onClick={() => { setGeneratedConfig(null); setConfigDescription(''); }}
                      >
                        ← Generate Another
                      </button>
                      <button
                        className="button button-primary"
                        onClick={async () => {
                          if (confirm('Apply this configuration to the device?\n\nThis will use commit-confirmed with auto-rollback.')) {
                            try {
                              const result = await devicesApi.applyCommands(
                                device!.id,
                                generatedConfig.commands,
                                `AI Generated: ${configDescription.substring(0, 50)}`
                              );
                              alert(`✅ Configuration queued!\n\nTask ID: ${result.task_id}`);
                              setShowConfigWizard(false);
                              setTimeout(() => loadDevice(), 2000);
                            } catch (error: any) {
                              alert(`❌ Error: ${error.response?.data?.detail || error.message}`);
                            }
                          }
                        }}
                      >
                        ⚡ Apply Configuration
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Firmware Upgrade Modal */}
        {showFirmwareModal && (
          <div className="modal-overlay" onClick={() => setShowFirmwareModal(false)}>
            <div className="firmware-modal" onClick={(e) => e.stopPropagation()}>
              <div className="firmware-header">
                <h2>🚀 Firmware Upgrade - {device?.hostname}</h2>
                <button className="close-button" onClick={() => setShowFirmwareModal(false)}>×</button>
              </div>

              <div className="firmware-content">
                {/* Current Version Display */}
                <div className="current-version-banner">
                  <div>
                    <strong>Current Version:</strong> {device?.junos_version || 'Unknown'}
                  </div>
                  <div className="version-status">
                    <span className="badge badge-info">{device?.model || 'SRX'}</span>
                  </div>
                </div>

                {/* Firmware Selection */}
                <div className="firmware-selection-section">
                  <h3>📦 Select Target Firmware Version</h3>
                  <select
                    className="firmware-select"
                    value={selectedFirmware}
                    onChange={(e) => setSelectedFirmware(e.target.value)}
                  >
                    <option value="">-- Select Firmware Version --</option>
                    {firmwareList.map((fw) => (
                      <option key={fw.version} value={fw.version}>
                        {fw.version} ({fw.size_mb} MB) - {fw.filename}
                      </option>
                    ))}
                  </select>

                  {selectedFirmware && (
                    <div className="firmware-actions">
                      <button
                        className="button button-secondary"
                        onClick={handleCheckReadiness}
                        disabled={checkingReadiness}
                      >
                        {checkingReadiness ? 'Checking...' : '🤖 Check AI Readiness'}
                      </button>
                      <button
                        className="button button-secondary"
                        onClick={handleGeneratePlan}
                        disabled={generatingPlan}
                      >
                        {generatingPlan ? 'Generating...' : '📋 Generate AI Plan'}
                      </button>
                    </div>
                  )}
                </div>

                {/* AI Readiness Check Results */}
                {readinessCheck && (
                  <div className={`readiness-results ${readinessCheck.readiness.ready ? 'ready' : 'not-ready'}`}>
                    <h3>🤖 AI Readiness Analysis</h3>

                    <div className="readiness-summary">
                      <div className="readiness-status">
                        <span className={`badge ${readinessCheck.readiness.ready ? 'badge-success' : 'badge-error'}`}>
                          {readinessCheck.readiness.ready ? '✓ READY' : '✗ NOT READY'}
                        </span>
                        <span className="readiness-risk">
                          Risk: <strong>{readinessCheck.readiness.overall_risk?.toUpperCase()}</strong>
                        </span>
                        <span className="readiness-confidence">
                          Confidence: <strong>{readinessCheck.readiness.confidence?.toUpperCase()}</strong>
                        </span>
                      </div>
                      <p className="readiness-summary-text">{readinessCheck.readiness.summary}</p>
                    </div>

                    {readinessCheck.readiness.prerequisites && readinessCheck.readiness.prerequisites.length > 0 && (
                      <div className="readiness-prereqs">
                        <strong>📋 Prerequisites:</strong>
                        <ul>
                          {readinessCheck.readiness.prerequisites.map((prereq, i) => (
                            <li key={i}>{prereq}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {readinessCheck.readiness.warnings && readinessCheck.readiness.warnings.length > 0 && (
                      <div className="readiness-warnings">
                        <strong>⚠️ Warnings:</strong>
                        <ul>
                          {readinessCheck.readiness.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {readinessCheck.readiness.estimated_downtime && (
                      <div className="readiness-downtime">
                        <strong>⏱️ Estimated Downtime:</strong> {readinessCheck.readiness.estimated_downtime}
                      </div>
                    )}
                  </div>
                )}

                {/* AI Upgrade Plan */}
                {upgradePlan && (
                  <div className="upgrade-plan-results">
                    <h3>📋 AI-Generated Upgrade Plan</h3>

                    <div className="plan-summary">
                      <p>{upgradePlan.plan.summary}</p>
                      <div className="plan-duration">
                        <strong>⏱️ Estimated Duration:</strong> {upgradePlan.plan.estimated_duration}
                      </div>
                    </div>

                    <div className="plan-steps">
                      <strong>Steps:</strong>
                      {upgradePlan.plan.steps.map((step, idx) => (
                        <div key={idx} className="plan-step">
                          <div className="step-header">
                            <span className="step-number">{idx + 1}</span>
                            <strong>{step.phase}</strong>
                          </div>
                          <p>{step.description}</p>
                          {step.commands && step.commands.length > 0 && (
                            <pre className="step-commands">{step.commands.join('\n')}</pre>
                          )}
                        </div>
                      ))}
                    </div>

                    {upgradePlan.plan.rollback_procedure && upgradePlan.plan.rollback_procedure.length > 0 && (
                      <div className="rollback-procedure">
                        <strong>🔄 Rollback Procedure:</strong>
                        {upgradePlan.plan.rollback_procedure.map((rb, idx) => (
                          <div key={idx} className="rollback-step">
                            <strong>{rb.step}</strong>
                            <pre>{rb.commands.join('\n')}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Upgrade Action Button */}
                {selectedFirmware && (
                  <div className="firmware-upgrade-action">
                    <button
                      className="button button-danger"
                      onClick={handleInitiateUpgrade}
                      disabled={initiatingUpgrade || (readinessCheck && !readinessCheck.readiness.ready)}
                    >
                      {initiatingUpgrade ? 'Initiating Upgrade...' : '🚀 Start Firmware Upgrade'}
                    </button>
                    {readinessCheck && !readinessCheck.readiness.ready && (
                      <p className="upgrade-warning">
                        ⚠️ Device is not ready for upgrade. Review readiness check results above.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Configuration Analysis Results */}
        {analysis && (
          <section className="card full-width ai-analysis">
            <h2>🤖 AI Configuration Analysis</h2>

            <div className="analysis-summary">
              <h3>Summary</h3>
              <p>{analysis.analysis.summary}</p>

              <div className="analysis-scores">
                <div className="score-box">
                  <span className="score-label">Overall Severity</span>
                  <span className={`badge badge-${analysis.analysis.severity === 'critical' ? 'error' : analysis.analysis.severity === 'high' ? 'warning' : analysis.analysis.severity === 'medium' ? 'info' : 'success'}`}>
                    {analysis.analysis.severity.toUpperCase()}
                  </span>
                </div>
                <div className="score-box">
                  <span className="score-label">Security Score</span>
                  <span className="score-value">{analysis.analysis.security_score}/100</span>
                </div>
                <div className="score-box">
                  <span className="score-label">Compliance Score</span>
                  <span className="score-value">{analysis.analysis.compliance_score}/100</span>
                </div>
                <div className="score-box">
                  <span className="score-label">JunOS Version</span>
                  <span className="score-value">{analysis.analysis.junos_version}</span>
                </div>
              </div>
            </div>

            <div className="findings-section">
              <h3>Findings ({analysis.analysis.findings.length})</h3>
              {analysis.analysis.findings.map((finding, index) => (
                <div key={index} className={`finding finding-${finding.severity}`}>
                  <div className="finding-header">
                    <span className={`badge badge-${finding.severity === 'critical' ? 'error' : finding.severity === 'high' ? 'warning' : finding.severity === 'medium' ? 'info' : 'success'}`}>
                      {finding.severity.toUpperCase()}
                    </span>
                    <span className="finding-category">{finding.category}</span>
                    <h4>{finding.title}</h4>
                  </div>
                  <p className="finding-description">{finding.description}</p>
                  <div className="finding-recommendation">
                    <strong>💡 Recommendation:</strong> {finding.recommendation}
                  </div>

                  {finding.commands && finding.commands.length > 0 && (
                    <div className="finding-commands">
                      <strong>🔧 Remediation Commands:</strong>
                      <pre className="commands-block">
                        {finding.commands.join('\n')}
                      </pre>
                      <div className="command-actions">
                        <button
                          className="button-small button-secondary"
                          onClick={() => {
                            navigator.clipboard.writeText(finding.commands!.join('\n'));
                            alert('Commands copied to clipboard!');
                          }}
                        >
                          📋 Copy Commands
                        </button>
                        <button
                          className="button-small button-warning"
                          onClick={async () => {
                            if (confirm(`⚠️  APPLY CONFIGURATION CHANGES?\n\nDevice: ${device?.hostname}\n\nCommands:\n${finding.commands!.join('\n')}\n\nThis will:\n1. Apply changes with commit-confirmed (5 min)\n2. Auto-rollback if device becomes unreachable\n3. Create pre/post-change backups\n\nProceed?`)) {
                              try {
                                const result = await devicesApi.applyCommands(
                                  device!.id,
                                  finding.commands!,
                                  finding.title
                                );
                                alert(`✅ Configuration change queued!\n\nTask ID: ${result.task_id}\n\nThe change will be applied with commit-confirmed. Check the Jobs page to monitor progress.`);
                                // Refresh device and job list after a delay
                                setTimeout(() => {
                                  loadDevice();
                                }, 2000);
                              } catch (error: any) {
                                alert(`❌ Error: ${error.response?.data?.detail || error.message}`);
                              }
                            }
                          }}
                        >
                          ⚡ Apply Fix
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="analysis-footer">
              <small>Analyzed backup #{analysis.backup_id} from {formatPhoenixTime(analysis.backup_date)}</small>
            </div>
          </section>
        )}

        {/* Recent Changes / Job History */}
        <section className="card full-width jobs-section">
          <h2>📋 Recent Changes & Jobs</h2>

          {jobs.length === 0 ? (
            <p className="no-data">No jobs found for this device.</p>
          ) : (
            <div className="jobs-table">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Queued</th>
                    <th>Duration</th>
                    <th>User</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <>
                      <tr key={job.id} className={`job-row job-${job.status}`}>
                        <td>
                          <span className="job-type-badge">
                            {job.job_type === 'config_change' && '⚙️'}
                            {job.job_type === 'backup' && '💾'}
                            {job.job_type === 'health_check' && '🏥'}
                            {job.job_type === 'upgrade' && '🚀'}
                            {' '}
                            {job.job_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : job.status === 'running' ? 'warning' : 'info'}`}>
                            {job.status.toUpperCase()}
                          </span>
                        </td>
                        <td>{formatPhoenixTime(job.queued_at)}</td>
                        <td>
                          {job.finished_at && job.started_at
                            ? `${Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000)}s`
                            : job.started_at
                            ? 'Running...'
                            : '-'}
                        </td>
                        <td>{job.user_email || '-'}</td>
                        <td>
                          <button
                            className="button-small button-secondary"
                            onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                          >
                            {expandedJobId === job.id ? '▼ Hide' : '▶ Details'}
                          </button>
                        </td>
                      </tr>
                      {expandedJobId === job.id && (
                        <tr className="job-details-row">
                          <td colSpan={6}>
                            <div className="job-details">
                              <div className="job-detail-section">
                                <strong>Task ID:</strong> {job.task_id || 'N/A'}
                              </div>

                              {job.error_text && (
                                <div className="job-detail-section error-section">
                                  <strong>❌ Error:</strong>
                                  <pre>{job.error_text}</pre>
                                </div>
                              )}

                              {job.result_json && job.job_type === 'config_change' && (
                                <>
                                  {job.result_json.commands && (
                                    <div className="job-detail-section">
                                      <strong>📝 Commands Applied ({job.result_json.commands.length}):</strong>
                                      <pre className="commands-block">
                                        {job.result_json.commands.join('\n')}
                                      </pre>
                                    </div>
                                  )}

                                  {job.result_json.description && (
                                    <div className="job-detail-section">
                                      <strong>Description:</strong> {job.result_json.description}
                                    </div>
                                  )}

                                  {job.result_json.diff && (
                                    <div className="job-detail-section">
                                      <strong>🔍 Configuration Diff:</strong>
                                      <pre className="diff-block">{job.result_json.diff}</pre>
                                    </div>
                                  )}

                                  {job.result_json.pre_commit && (
                                    <div className="job-detail-section">
                                      <strong>Git Commits:</strong>
                                      <div className="commit-info">
                                        <span>Pre-change: {job.result_json.pre_commit.substring(0, 8)}</span>
                                        {job.result_json.post_commit && (
                                          <span> → Post-change: {job.result_json.post_commit.substring(0, 8)}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              {job.result_json && job.job_type === 'health_check' && (
                                <div className="job-detail-section">
                                  <strong>Health Check Results:</strong>
                                  <pre>{JSON.stringify(job.result_json, null, 2)}</pre>
                                </div>
                              )}

                              {job.result_json && job.job_type === 'backup' && (
                                <div className="job-detail-section">
                                  <strong>Backup Results:</strong>
                                  <pre>{JSON.stringify(job.result_json, null, 2)}</pre>
                                </div>
                              )}

                              {job.result_json && job.job_type === 'upgrade' && (
                                <div className="job-detail-section">
                                  <strong>🚀 Firmware Upgrade Results:</strong>
                                  <div className="upgrade-result-display">
                                    <div className="upgrade-versions">
                                      <span><strong>Previous:</strong> {job.result_json.previous_version}</span>
                                      <span>→</span>
                                      <span><strong>New:</strong> {job.result_json.new_version}</span>
                                    </div>
                                    {job.result_json.ai_recommendation && (
                                      <div className={`upgrade-ai-result ${job.result_json.ai_recommendation.success ? 'success' : 'warning'}`}>
                                        <strong>🤖 AI Recommendation:</strong>
                                        <p>{job.result_json.ai_recommendation.recommendation}</p>
                                        <p>{job.result_json.ai_recommendation.summary}</p>
                                      </div>
                                    )}
                                    <div className="upgrade-commits">
                                      <strong>Git Backups:</strong>
                                      <span>Pre: {job.result_json.pre_backup_commit?.substring(0, 8)}</span>
                                      <span>Post: {job.result_json.post_backup_commit?.substring(0, 8)}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        nav {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          padding: 1rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
        }

        nav a {
          color: var(--accent-primary);
          text-decoration: none;
          font-weight: 500;
        }

        nav a:hover {
          text-decoration: underline;
        }

        header {
          margin-bottom: 2rem;
        }

        header h1 {
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .status-badges {
          display: flex;
          gap: 0.5rem;
        }

        .actions {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .card {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          box-shadow: var(--shadow-sm);
        }

        .card h2 {
          font-size: 1.1rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid var(--border-secondary);
          color: var(--text-primary);
        }

        .detail-table {
          width: 100%;
          border: none;
        }

        .detail-table th {
          background: none;
          text-align: left;
          font-weight: 600;
          padding: 0.5rem 1rem 0.5rem 0;
          width: 40%;
          border: none;
          text-transform: none;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .detail-table td {
          padding: 0.5rem 0;
          border: none;
          color: var(--text-primary);
        }

        .detail-table tr {
          border-bottom: 1px solid var(--border-secondary);
        }

        .detail-table tr:last-child {
          border-bottom: none;
        }

        .full-width {
          grid-column: 1 / -1;
          margin-top: 2rem;
        }

        .table-container {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }

        table th {
          background: var(--bg-tertiary);
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          border-bottom: 2px solid var(--border-primary);
          color: var(--text-primary);
        }

        table td {
          padding: 0.75rem;
          border-bottom: 1px solid var(--border-secondary);
          color: var(--text-primary);
        }

        table tr:hover {
          background: var(--bg-hover);
        }

        .commit-sha {
          font-family: 'Monaco', 'Courier New', monospace;
          background: var(--bg-tertiary);
          padding: 0.2rem 0.5rem;
          border-radius: 3px;
          font-size: 0.85rem;
          color: var(--text-primary);
        }

        .file-path {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .no-data {
          padding: 2rem;
          text-align: center;
          color: var(--text-tertiary);
          font-style: italic;
        }

        .action-link {
          color: var(--accent-primary);
          text-decoration: none;
          font-weight: 500;
          font-size: 0.9rem;
        }

        .action-link:hover {
          text-decoration: underline;
        }

        code {
          font-family: 'Courier New', monospace;
          background: var(--bg-tertiary);
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .error {
          background: var(--danger-bg);
          color: var(--danger-text);
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        /* AI Analysis Button */
        .button-ai {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .button-ai:hover:not(:disabled) {
          background: linear-gradient(135deg, #5568d3 0%, #6a4299 100%);
          transform: translateY(-1px);
        }

        .button-ai:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* AI Analysis Results */
        .ai-analysis {
          margin-top: 2rem;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          border-left: 4px solid #667eea;
        }

        .analysis-summary h3 {
          margin-top: 0;
          color: #333;
        }

        .analysis-scores {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .score-box {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .score-label {
          font-size: 0.85rem;
          color: #666;
          margin-bottom: 0.5rem;
        }

        .score-value {
          font-size: 1.5rem;
          font-weight: bold;
          color: #333;
        }

        .findings-section {
          margin-top: 2rem;
        }

        .findings-section h3 {
          color: #333;
          margin-bottom: 1rem;
        }

        .finding {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .finding-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          flex-wrap: wrap;
        }

        .finding-category {
          font-size: 0.85rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .finding-header h4 {
          margin: 0;
          flex: 1;
          min-width: 200px;
        }

        .finding-description {
          color: #555;
          margin: 0.5rem 0;
          line-height: 1.6;
        }

        .finding-recommendation {
          background: #f0f4ff;
          padding: 0.75rem;
          border-radius: 4px;
          margin-top: 0.5rem;
          border-left: 3px solid #667eea;
        }

        .finding-recommendation strong {
          color: #667eea;
        }

        .finding-commands {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 4px;
          margin-top: 1rem;
          border: 1px solid #dee2e6;
        }

        .finding-commands strong {
          color: #495057;
          display: block;
          margin-bottom: 0.5rem;
        }

        .commands-block {
          background: #2d3748;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 4px;
          overflow-x: auto;
          font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
          font-size: 0.9rem;
          line-height: 1.5;
          margin: 0.5rem 0;
        }

        .command-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .button-small {
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .button-small.button-secondary {
          background: #6c757d;
          color: white;
        }

        .button-small.button-secondary:hover {
          background: #5a6268;
        }

        .button-small.button-warning {
          background: #ffc107;
          color: #212529;
        }

        .button-small.button-warning:hover {
          background: #e0a800;
        }

        .analysis-footer {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
          color: #666;
        }

        /* Chat Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .chat-modal {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          width: 90%;
          max-width: 800px;
          height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-xl);
        }

        .chat-header {
          padding: 1.5rem;
          border-bottom: 2px solid var(--border-secondary);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .chat-header h2 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--text-primary);
        }

        .close-button {
          background: none;
          border: none;
          font-size: 2rem;
          cursor: pointer;
          color: var(--text-secondary);
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-button:hover {
          color: var(--text-primary);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .chat-welcome {
          text-align: center;
          color: var(--text-secondary);
          padding: 2rem;
        }

        .chat-examples {
          margin-top: 1rem;
          font-size: 0.9rem;
          text-align: left;
          display: inline-block;
        }

        .chat-message {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-width: 80%;
        }

        .chat-message.user {
          align-self: flex-end;
          align-items: flex-end;
        }

        .chat-message.assistant {
          align-self: flex-start;
          align-items: flex-start;
        }

        .message-role {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .message-content {
          padding: 1rem;
          border-radius: var(--radius-lg);
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .chat-message.user .message-content {
          background: var(--accent-primary);
          color: white;
        }

        .chat-message.assistant .message-content {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--border-secondary);
        }

        .message-content.typing {
          font-style: italic;
          color: var(--text-secondary);
        }

        .chat-input-container {
          padding: 1.5rem;
          border-top: 2px solid var(--border-secondary);
          display: flex;
          gap: 0.75rem;
        }

        .chat-input {
          flex: 1;
          padding: 0.75rem 1rem;
          border: 2px solid var(--border-secondary);
          border-radius: var(--radius-md);
          font-size: 1rem;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .chat-input:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        .chat-send-button {
          padding: 0.75rem 2rem;
          background: var(--accent-primary);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .chat-send-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .chat-send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .button-chat {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .button-chat:hover {
          background: linear-gradient(135deg, #5568d3 0%, #63408a 100%);
        }

        .button-wizard {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
        }

        .button-wizard:hover {
          background: linear-gradient(135deg, #d67ddb 0%, #d4475a 100%);
        }

        /* Config Wizard Styles */
        .config-wizard-modal {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          width: 90%;
          max-width: 900px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-xl);
        }

        .wizard-header {
          padding: 1.5rem;
          border-bottom: 2px solid var(--border-secondary);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .wizard-header h2 {
          color: var(--text-primary);
        }

        .wizard-content {
          padding: 2rem;
          overflow-y: auto;
          flex: 1;
        }

        .wizard-input-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .wizard-instructions {
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .config-description-input {
          width: 100%;
          padding: 1rem;
          border: 2px solid var(--border-secondary);
          border-radius: var(--radius-md);
          font-size: 1rem;
          font-family: inherit;
          resize: vertical;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .config-description-input:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        .generated-config-display {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .config-summary {
          padding: 1rem;
          background: #e7f3ff;
          border-radius: 8px;
          border-left: 4px solid #007bff;
        }

        .config-commands {
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .config-warnings {
          padding: 1rem;
          background: #fff3cd;
          border-radius: 8px;
          border-left: 4px solid #ffc107;
        }

        .config-warnings ul {
          margin: 0.5rem 0 0 1.5rem;
        }

        .config-warnings li {
          margin: 0.5rem 0;
        }

        .wizard-actions {
          display: flex;
          gap: 1rem;
          justify-content: space-between;
          padding-top: 1rem;
          border-top: 2px solid #e9ecef;
        }

        .button-primary {
          padding: 0.75rem 1.5rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .button-primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .button-primary:disabled {
          background: #6c757d;
          cursor: not-allowed;
          opacity: 0.5;
        }

        /* Jobs Section */
        .jobs-section {
          margin-top: 2rem;
        }

        .jobs-table {
          overflow-x: auto;
        }

        .jobs-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .jobs-table th {
          background: #f8f9fa;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          border-bottom: 2px solid #dee2e6;
        }

        .jobs-table td {
          padding: 12px;
          border-bottom: 1px solid #dee2e6;
        }

        .job-row {
          transition: background-color 0.2s;
        }

        .job-row:hover {
          background-color: #f8f9fa;
        }

        .job-row.job-completed {
          background-color: #f0fff4;
        }

        .job-row.job-failed {
          background-color: #fff0f0;
        }

        .job-row.job-running {
          background-color: #fffbf0;
        }

        .job-type-badge {
          font-weight: 500;
          text-transform: capitalize;
        }

        .job-details-row {
          background-color: #f8f9fa;
        }

        .job-details {
          padding: 1rem;
          border-left: 4px solid #007bff;
        }

        .job-detail-section {
          margin-bottom: 1rem;
        }

        .job-detail-section strong {
          display: block;
          margin-bottom: 0.5rem;
          color: #495057;
        }

        .job-detail-section pre {
          background: white;
          padding: 1rem;
          border-radius: 4px;
          border: 1px solid #dee2e6;
          overflow-x: auto;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .error-section {
          border-left: 4px solid #dc3545;
          padding-left: 1rem;
        }

        .error-section pre {
          background: #fff5f5;
          border-color: #dc3545;
          color: #dc3545;
        }

        .diff-block {
          max-height: 400px;
          overflow-y: auto;
        }

        .commit-info {
          display: flex;
          gap: 1rem;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 0.875rem;
          color: #6c757d;
        }

        .no-data {
          color: #6c757d;
          font-style: italic;
          padding: 1rem;
          text-align: center;
        }

        /* Firmware Upgrade Styles */
        .button-firmware {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
          border: 2px solid transparent;
        }

        .button-firmware:hover {
          background: linear-gradient(135deg, #d67ee0 0%, #d9485a 100%);
          transform: translateY(-1px);
        }

        .firmware-modal {
          background: var(--bg-primary);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-lg);
          width: 90%;
          max-width: 1000px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-xl);
        }

        .firmware-header {
          padding: 1.5rem;
          border-bottom: 2px solid var(--border-secondary);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }

        .firmware-header h2 {
          margin: 0;
          font-size: 1.25rem;
          color: white;
        }

        .firmware-content {
          padding: 2rem;
          overflow-y: auto;
          flex: 1;
        }

        .current-version-banner {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .current-version-banner strong {
          color: white;
        }

        .version-status {
          display: flex;
          gap: 0.5rem;
        }

        .firmware-selection-section {
          background: var(--bg-secondary);
          padding: 1.5rem;
          border-radius: var(--radius-md);
          margin-bottom: 1.5rem;
          border: 1px solid var(--border-secondary);
        }

        .firmware-selection-section h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .firmware-select {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid var(--border-secondary);
          border-radius: var(--radius-md);
          font-size: 1rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          margin-bottom: 1rem;
        }

        .firmware-select:focus {
          outline: none;
          border-color: #f5576c;
        }

        .firmware-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .readiness-results {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          border-left: 4px solid #28a745;
        }

        .readiness-results.not-ready {
          border-left-color: #dc3545;
        }

        .readiness-results h3 {
          margin-top: 0;
          color: #495057;
        }

        .readiness-summary {
          margin-bottom: 1rem;
        }

        .readiness-status {
          display: flex;
          gap: 1rem;
          align-items: center;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }

        .readiness-risk,
        .readiness-confidence {
          font-size: 0.9rem;
          color: #6c757d;
        }

        .readiness-summary-text {
          background: white;
          padding: 1rem;
          border-radius: 6px;
          margin: 0.75rem 0;
          line-height: 1.6;
        }

        .readiness-prereqs,
        .readiness-warnings {
          background: white;
          padding: 1rem;
          border-radius: 6px;
          margin-top: 1rem;
        }

        .readiness-warnings {
          background: #fff3cd;
          border-left: 3px solid #ffc107;
        }

        .readiness-prereqs ul,
        .readiness-warnings ul {
          margin: 0.5rem 0 0 1.5rem;
          padding: 0;
        }

        .readiness-prereqs li,
        .readiness-warnings li {
          margin: 0.5rem 0;
          line-height: 1.5;
        }

        .readiness-downtime {
          background: #e7f3ff;
          padding: 0.75rem;
          border-radius: 6px;
          margin-top: 1rem;
          border-left: 3px solid #007bff;
        }

        .upgrade-plan-results {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          border-left: 4px solid #007bff;
        }

        .upgrade-plan-results h3 {
          margin-top: 0;
          color: #495057;
        }

        .plan-summary {
          background: white;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
        }

        .plan-duration {
          margin-top: 0.75rem;
          padding: 0.5rem;
          background: #e7f3ff;
          border-radius: 4px;
        }

        .plan-steps {
          margin-top: 1rem;
        }

        .plan-steps > strong {
          display: block;
          margin-bottom: 0.75rem;
          color: #495057;
        }

        .plan-step {
          background: white;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 0.75rem;
          border-left: 3px solid #007bff;
        }

        .step-header {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .step-number {
          background: #007bff;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 0.9rem;
        }

        .step-commands {
          background: #2d3748;
          color: #e2e8f0;
          padding: 0.75rem;
          border-radius: 4px;
          font-size: 0.85rem;
          margin-top: 0.5rem;
          overflow-x: auto;
        }

        .rollback-procedure {
          background: #fff3cd;
          padding: 1rem;
          border-radius: 6px;
          margin-top: 1rem;
          border-left: 3px solid #ffc107;
        }

        .rollback-procedure strong {
          display: block;
          margin-bottom: 0.75rem;
          color: #495057;
        }

        .rollback-step {
          background: white;
          padding: 0.75rem;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        .rollback-step strong {
          font-size: 0.9rem;
          color: #856404;
        }

        .rollback-step pre {
          background: #2d3748;
          color: #e2e8f0;
          padding: 0.75rem;
          border-radius: 4px;
          font-size: 0.85rem;
          margin-top: 0.5rem;
          overflow-x: auto;
        }

        .firmware-upgrade-action {
          text-align: center;
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 8px;
          border-top: 3px solid #dc3545;
        }

        .firmware-upgrade-action button {
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .button-danger {
          background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .button-danger:hover:not(:disabled) {
          background: linear-gradient(135deg, #c82333 0%, #a71d2a 100%);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
        }

        .button-danger:disabled {
          background: #6c757d;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .upgrade-warning {
          margin-top: 1rem;
          color: #856404;
          background: #fff3cd;
          padding: 0.75rem;
          border-radius: 6px;
          font-size: 0.95rem;
        }

        /* Upgrade Job Result Display */
        .upgrade-result-display {
          background: white;
          padding: 1rem;
          border-radius: 6px;
          margin-top: 0.5rem;
        }

        .upgrade-versions {
          display: flex;
          gap: 1rem;
          align-items: center;
          padding: 0.75rem;
          background: #e7f3ff;
          border-radius: 4px;
          margin-bottom: 1rem;
          font-size: 1rem;
        }

        .upgrade-versions span {
          font-family: 'Monaco', 'Courier New', monospace;
        }

        .upgrade-ai-result {
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1rem;
          border-left: 4px solid;
        }

        .upgrade-ai-result.success {
          background: #d4edda;
          border-left-color: #28a745;
        }

        .upgrade-ai-result.warning {
          background: #fff3cd;
          border-left-color: #ffc107;
        }

        .upgrade-ai-result strong {
          display: block;
          margin-bottom: 0.5rem;
        }

        .upgrade-ai-result p {
          margin: 0.25rem 0;
        }

        .upgrade-commits {
          display: flex;
          gap: 1rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 4px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 0.9rem;
        }

        .upgrade-commits strong {
          margin-right: 0.5rem;
        }
      `}</style>
    </>
  );
}
