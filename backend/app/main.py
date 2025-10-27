"""
SRX Fleet Manager - FastAPI Application
Main application entry point
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import structlog
from datetime import datetime
from fastapi.encoders import jsonable_encoder
from typing import Any

from app.settings import get_settings
from app.database import engine, Base

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting SRX Fleet Manager API", version=settings.app_version)

    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")

    yield

    # Shutdown
    logger.info("Shutting down SRX Fleet Manager API")


# Custom JSON encoder for datetime
def custom_json_encoder(obj: Any) -> str:
    """Custom JSON encoder that ensures datetime objects are serialized with 'Z' suffix"""
    if isinstance(obj, datetime):
        return obj.isoformat() + 'Z' if not obj.isoformat().endswith('Z') else obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Enterprise-grade Juniper SRX firewall fleet management platform",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Override default JSON encoder
import json
from fastapi.responses import ORJSONResponse


class CustomJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            default=custom_json_encoder,
        ).encode("utf-8")


app.router.default_response_class = CustomJSONResponse

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": settings.app_version,
        "app": settings.app_name
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "SRX Fleet Manager API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health"
    }


# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(
        "Unhandled exception",
        exc_info=exc,
        path=request.url.path,
        method=request.method
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "type": type(exc).__name__
        }
    )


# Import and include routers
from app.routers import devices, jobs

app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug
    )
