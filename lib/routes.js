var handlers = require('./handlers');

module.exports = [{
    method: 'POST',
    path: '/subscribe',
    config: handlers.postSub
}, {
    method: 'GET',
    path: '/s/{subId}',
    config: handlers.getSub
}, {
    method: 'DELETE',
    path: '/s/{subId}',
    config: handlers.delSub
}, {
    method: 'POST',
    path: '/p/{subToken}',
    config: handlers.postUpdate
}, {
    method: 'PUT',
    path: '/d/{updateToken}',
    config: handlers.putUpdate
}, {
    method: 'DELETE',
    path: '/d/{updateToken}',
    config: handlers.delUpdate
}, {
    method: 'POST',
    path: '/receipts/{subToken}',
    config: handlers.postReceiptSub
}, {
    method: 'GET',
    path: '/r/{receiptToken}',
    config: handlers.getReceipts
}];
