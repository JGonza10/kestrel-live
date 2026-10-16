"""Conexión con LiveKit: tokens para entrar al estudio y Egress para transmitir/grabar."""
import asyncio

from flask import current_app
from livekit import api


def _creds():
    key = current_app.config.get("LIVEKIT_API_KEY")
    secret = current_app.config.get("LIVEKIT_API_SECRET")
    if not key or not secret:
        raise RuntimeError("Faltan LIVEKIT_API_KEY / LIVEKIT_API_SECRET.")
    return key, secret


def make_join_token(room_name: str, identity: str, display_name: str, can_publish: bool = True) -> str:
    key, secret = _creds()
    grants = api.VideoGrants(
        room_join=True,
        room=room_name,
        can_publish=can_publish,
        can_subscribe=True,
        can_publish_data=True,
    )
    return (
        api.AccessToken(key, secret)
        .with_identity(identity)
        .with_name(display_name)
        .with_grants(grants)
        .to_jwt()
    )


async def _start_rtmp(room_name: str, urls: list[str], layout: str) -> str:
    key, secret = _creds()
    async with api.LiveKitAPI(current_app.config["LIVEKIT_URL"], key, secret) as lk:
        req = api.RoomCompositeEgressRequest(
            room_name=room_name,
            layout=layout,
            stream_outputs=[api.StreamOutput(protocol=api.StreamProtocol.RTMP, urls=urls)],
        )
        info = await lk.egress.start_room_composite_egress(req)
        return info.egress_id


async def _start_file(room_name: str, filepath: str, layout: str) -> str:
    key, secret = _creds()
    async with api.LiveKitAPI(current_app.config["LIVEKIT_URL"], key, secret) as lk:
        req = api.RoomCompositeEgressRequest(
            room_name=room_name,
            layout=layout,
            file_outputs=[api.EncodedFileOutput(file_type=api.EncodedFileType.MP4, filepath=filepath)],
        )
        info = await lk.egress.start_room_composite_egress(req)
        return info.egress_id


async def _stop(egress_id: str) -> None:
    key, secret = _creds()
    async with api.LiveKitAPI(current_app.config["LIVEKIT_URL"], key, secret) as lk:
        await lk.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id))


def start_stream(room_name: str, urls: list[str], layout: str = "speaker") -> str:
    return asyncio.run(_start_rtmp(room_name, urls, layout))


def start_recording(room_name: str, filepath: str, layout: str = "speaker") -> str:
    return asyncio.run(_start_file(room_name, filepath, layout))


def stop(egress_id: str) -> None:
    asyncio.run(_stop(egress_id))
