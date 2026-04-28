from __future__ import annotations

from fastapi import APIRouter

from models import SendSmsRequest, SendSmsResponse, VerifySmsRequest, VerifySmsResponse
from services.auth_store import send_sms_code, should_expose_sms_code, verify_sms_code


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/send-sms", response_model=SendSmsResponse)
def send_sms(payload: SendSmsRequest) -> SendSmsResponse:
    dev_code, expires_in = send_sms_code(payload.phone)
    return SendSmsResponse(
        ok=True,
        devCode=dev_code if should_expose_sms_code() else None,
        expiresIn=expires_in,
    )


@router.post("/verify", response_model=VerifySmsResponse)
def verify_sms(payload: VerifySmsRequest) -> VerifySmsResponse:
    token, user = verify_sms_code(payload.phone, payload.code)
    return VerifySmsResponse(ok=True, token=token, user=user)
