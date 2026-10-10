"""Local WebSocket endpoint. Protocol (same as the AWS WebSocket API):

client → {"action": "subscribe", "channels": ["dept:housekeeping"], "token": "<staff token>"}
         {"action": "subscribe", "channels": ["room:401"]}
         {"action": "ping"}
server → {"type": "subscribed", "channels": [...]} | {"type": "error", "message": ...} |
         {"type": "pong"} | ticket events
"""

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.realtime.channels import authorize_channels

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    hub = ws.app.state.hub
    auth = ws.app.state.auth
    await ws.accept()
    try:
        while True:
            try:
                msg = json.loads(await ws.receive_text())
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid JSON"})
                continue
            action = msg.get("action")
            if action == "ping":
                await ws.send_json({"type": "pong"})
            elif action == "subscribe":
                allowed, error = authorize_channels(msg.get("channels"), msg.get("token"), auth)
                if error:
                    await ws.send_json({"type": "error", "message": error})
                    continue
                for ch in allowed:
                    hub.subscribe(ws, ch)
                await ws.send_json({"type": "subscribed", "channels": allowed})
            else:
                await ws.send_json({"type": "error", "message": "unknown action"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.remove(ws)
