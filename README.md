# Web Push Server

This is a Node [Web Push](https://unicorn-wg.github.io/webpush-protocol/) server implementation.

## Getting Started

The server is distributed as an npm module. You'll need Node >= 0.10.32 and npm installed on your machine; instructions and screencasts are available [here](https://docs.npmjs.com/getting-started/installing-node). To install the server, run:

    $ npm install -g webpush-server

This installs a `webpush-server` executable that can be used to start the server. `webpush-server` requires the following flags:

* `--port` (Number): The port on which to listen (e.g., 8080).
* `--key` (String): The path to a PEM-encoded TLS certificate.
* `--cert` (String): The private key for the given certificate.
* `--pfx` (String): The combined certificate, private key, and CA certs in PFX format. Mutually exclusive with `--key` and `--cert`.
* `--h2c` (Boolean): Enable HTTP/2 over TCP. Mutually exclusive with `--key`, `--cert`, and `--pfx`. The [Node HTTP/2 library](https://github.com/molnarg/node-http2) does not currently implement the `Upgrade` mechanism for HTTP/2, so HTTP/1.1 clients will be rejected if this option is specified.

Example usage:

    $ webpush-server --port 8080 --key keys/key.pem --cert keys/cert.pem

## API

### `POST /subscribe`

This is the [push service](https://unicorn-wg.github.io/webpush-protocol/#message_subscription) resource. A user agent creates a new subscription for an application by requesting this resource.  The server allocates "subscription," "push" (`urn:ietf:params:push`) and "receipt subscribe" (`urn:ietf:params:push:receipt`) resources. The "subscription" resource is included in the `Location` response header; the "push" and "receipt subscribe" resources are included as link relations.

The application server uses the "push" resource to deliver push messages to the user agent, and the "receipt subscribe" resource to receive acknowledgements. Meanwhile, the user agent uses the "subscription" resource to receive pushed messages.

### `GET /s/{subId}`

This is the [subscription resource](https://unicorn-wg.github.io/webpush-protocol/#monitor), used by the user agent to receive push messages. Once the user agent requests this resource, messages sent to the corresponding "push" resource will be wrapped in HTTP/2 `PUSH_PROMISE` frames and delivered to the user agent. The `:path` pseudo-header will be set to the push message URL.

The user agent may specify a `Prefer: wait=0` header to request immediate delivery of all stored messages. If no messages are available, the server will return a 204 (No Content) response.

### `DELETE /s/{subId}`

The user agent requests this resource to delete an active subscription.

### `POST /p/{subToken}`

This is the [push resource](https://unicorn-wg.github.io/webpush-protocol/#send), used by the application server to deliver messages to the user agent. The subscription information is encoded into the `subToken` to prevent application servers from correlating or tampering with subscriptions. Returns a 201 (Created) response if the message is accepted. The `Location` header contains the push message URL.

If the application server includes a `TTL` request header, the user agent is offline, and the push service supports storage, the message will be stored for, at most, the given number of seconds. This is advisory only; the `TTL` response header specifies the actual message time-to-live. If the push server does not support storage, and a `TTL` request header is specified, the response header will always be `0`.

### `DELETE /d/{updateToken}`

The user agent requests this resource to [acknowledge received messages](https://unicorn-wg.github.io/webpush-protocol/#acknowledge_message).

### `PUT /d/{updateToken}`

The application server uses this resource to update pending messages.

### `POST /receipts/{subToken}`

This is the [receipt subscribe resource](https://unicorn-wg.github.io/webpush-protocol/#receipt_subscription), used by the application server to create a receipt subscription resource. Servers may create multiple receipt subscriptions per push service subscription. The `Push-Receipt` push request header indicates the subscription to use for delivering the receipt.

### `GET /r/{receiptToken}`

This is the [receipt subscription resource](https://unicorn-wg.github.io/webpush-protocol/#receive_receipt), used by the application server to receive acknowledgements. Acknowledgements are serialized as HTTP/2 `PUSH_PROMISE` frames, with the `:path` pseudo-header set to the acknowledged push message URL.

## License

MPL 2.0.
