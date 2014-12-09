var handlers = require('./handlers');

module.exports = [{
    // Client API: Registers a device with the push server, allocating
    // "monitor" and "channel" URIs. The URIs are included in the response
    // as link relations.
    method: 'POST',
    path: '/devices',
    config: handlers.postRegister
}, {
    // Client API: Creates a channel, returning the channel URI in a
    // `Location` header.
    method: 'POST',
    path: '/devices/{deviceId}/channels',
    config: handlers.postChannel
}, {
    // Client API: Returns the last message sent by an application on the
    // channel, or an empty response if the server does not store messages.
    method: 'GET',
    path: '/devices/{deviceId}/channels/{channelId}',
    config: handlers.getChannel
}, {
    // Client API: Deletes a registered channel.
    method: 'DELETE',
    path: '/devices/{deviceId}/channels/{channelId}',
    config: handlers.delChannel
}, {
    // Client API: Delivers notifications.
    method: 'GET',
    path: '/devices/{deviceId}',
    config: handlers.getMonitor
}, {
    // App server API: Sends a notification on a registered channel.
    method: 'PUT',
    path: '/updates/{key}',
    config: handlers.putUpdate
}];
