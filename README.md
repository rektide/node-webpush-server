# Web Push Server

This is a Node [Web Push](https://martinthomson.github.io/drafts/draft-thomson-webpush-http2.html) server implementation.

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

### `POST /devices`

This is the **push service** resource specified by draft-02, or the **push server URL** from draft-01. A client registers itself with the server by requesting this resource. The server allocates "registration" (`urn:ietf:params:push:reg`) and "subscribe" (`urn:ietf:params:push:sub`) resources, and includes them in the response as link relations.

The "registration" and "subscribe" resources were called "monitor" (`...:push:monitor`) and "channel" (`...:push:channel`), respectively, in draft-01.

### `GET /devices/{regId}`

This is the **registration** resource specified by draft-02, or the **monitor** resource from draft-01. A client requests this resource to receive push messages. Messages sent by the application server are serialized as HTTP/2 `PUSH_PROMISE` frames for `GET` requests to the associated "subscription" resource.

### `POST /devices/{regId}/channels`

This is the **subscribe** resource specified by draft-02, or the **channel** resource from draft-01. A registered client creates a new subscription by requesting this resource. The server allocates a "subscription" (`urn:ietf:params:push`) resource, and includes it in the response as a link relation. The `Location` header contains the channel URI for the application server.

Note that draft-02 subsumes the subscription and channel URIs under the "subscription" resource, while this implementation provides a separate channel URI. In draft-02, the URIs included in the `Link: <...>; rel="urn:ietf:params:push"` and `Location` headers are equivalent.

### `GET /devices/{regId}/channels/{subId}`

This is the **subscription** resource specified by draft-02. A client can fetch the last message sent by an application server for a subscription by requesting this resource. If the server does not store messages, a 204 (No Content) response is returned.

This implementation does not currently store messages; incoming messages will be dropped if the client is not holding open a request to the registration resource.

### `DELETE /devices/{regId}/channels/{subId}`

This deletes an active subscription. Since messages are not currently stored, requesting this resource is a no-op.

### `PUT /updates/{key}`

This is the resource allocated by the subscribe resource for the application server. The registration and subscription information is encoded into the opaque `key` to prevent application servers from correlating subscriptions for a client.

## License

MPL 2.0.
