// mqtt-broker.js
const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');

const port = 1883;
const wsPort = 8883;

// MQTT over TCP
server.listen(port, function() {
	console.log(`MQTT Broker started on port ${port}`);
});

// MQTT over WebSocket
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(wsPort, function() {
	console.log(`MQTT WebSocket server started on port ${wsPort}`);
});

// Event handlers
aedes.on('client', function(client) {
	console.log(`Client ${client.id} connected`);
});

aedes.on('clientDisconnect', function(client) {
	console.log(`Client ${client.id} disconnected`);
});

aedes.on('publish', async function(packet, client) {
	if (client) {
		console.log(`Message from ${client.id}: ${packet.topic} -> ${packet.payload.toString()}`);
	}
});

aedes.on('subscribe', function(subscriptions, client) {
	console.log(`Client ${client.id} subscribed to:`, subscriptions.map(s => s.topic));
});

// Graceful shutdown
process.on('SIGINT', function() {
	console.log('Shutting down MQTT broker...');
	server.close();
	httpServer.close();
	process.exit(0);
});
