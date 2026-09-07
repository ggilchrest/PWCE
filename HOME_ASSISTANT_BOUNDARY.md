# Home Assistant integration boundary

The selected Personal V1 boundary is:

- `baseUrl`: site-local Home Assistant URL.
- `tokenRef`: opaque secret-manager/environment reference. The token value is resolved only at connection time and is never persisted in PWCE state, Actions, Observations, or audit records.
- REST: bearer-token requests for state reads and service calls.
- WebSocket: bearer-token authentication at `/api/websocket`, followed by a `state_changed` subscription.
- PWCE adapter: normalizes Home Assistant state events into site-qualified Observations; Home Assistant remains the device and service owner.
- Test boundary: the adapter accepts injected transport and secret resolution so protocol behavior can be tested without live credentials.

The implementation follows Home Assistant's documented REST bearer-token and WebSocket authentication/event model. Automated tests use transient tokens and fakes; the disposable Docker development setup may exercise a real local Home Assistant instance, while production availability and private-site custody remain unclaimed.
