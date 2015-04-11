// LevelDB key: `{subId}:updates:{updateId}`.
var Ack = exports.Ack = function Ack(path, headers) {
    this.path = path;
    this.headers = headers;
};

Ack.parse = function parse(data) {
    var model = JSON.parse(data);
    return new Ack(
        model.path,
        model.headers
    );
};

Ack.prototype.stringify = function stringify() {
    return JSON.stringify({
        path: this.path,
        headers: this.headers
    });
};

// LevelDB key: `{subId}:acks:{receiptId}:{updateId}`.
var Update = exports.Update = function Update(path, headers, payload) {
    this.path = path;
    this.headers = headers;
    this.payload = payload;
};

Update.parse = function parse(data) {
    var model = JSON.parse(data);
    return new Update(
        model.path,
        model.headers,
        new Buffer(model.payload, 'base64')
    );
};

Update.prototype.stringify = function stringify() {
    return JSON.stringify({
        path: this.path,
        headers: this.headers,
        payload: this.payload.toString('base64')
    });
};
