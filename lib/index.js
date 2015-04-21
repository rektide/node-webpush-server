var hapi = require('hapi');
var http2 = require('http2');

var routes = require('./routes');

module.exports = function createServer(hostname, port, listenerOpts, context) {
    var server = new hapi.Server({
        minimal: true,
        connections: {
            routes: {
                payload: {
                    failAction: 'ignore'
                }
            }
        }
    });
    server.connection({
        host: hostname,
        port: port,
        listener: new http2.Server(listenerOpts),
        tls: true
    });
    server.bind(context);
    server.route(routes);
    return server;
};
