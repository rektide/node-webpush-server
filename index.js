var assert = require('assert');
var fs = require('fs');

var hapi = require('hapi');
var http2 = require('http2');
var minimist = require('minimist');

var Context = require('./lib/context');
var routes = require('./lib/routes');

function createServer(options) {
    assert(options && typeof options == 'object', 'Missing server options');

    var port = options.port;
    assert(isFinite(port), 'The server port must be a number');

    var listenerOpts = {};
    var hasKeys = !!(options.key && options.cert) ^ options.pfx;
    assert(hasKeys ^ options.h2c, 'Missing or invalid server keys');
    if (options.pfx) {
        listenerOpts.pfx = fs.readFileSync(options.pfx);
    } else if (options.key) {
        listenerOpts.key = fs.readFileSync(options.key);
        listenerOpts.cert = fs.readFileSync(options.cert);
    } else {
        listenerOpts.plain = true;
    }

    var server = new hapi.Server({
        minimal: true
    });
    server.connection({
        port: options.port,
        listener: new http2.Server(listenerOpts),
        tls: true
    });
    server.bind(new Context());
    server.route(routes);
    return server;
}

function main() {
    var flags = minimist(process.argv.slice(2));
    var server = createServer(flags);

    server.start(function afterStart(err) {
        if (err) {
            throw err;
        }
        console.log('Listening on %s...', server.info.uri);
    });
}

main();
