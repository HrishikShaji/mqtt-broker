
// mqtt-broker.js
const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require("./mqtt-73b63-firebase-adminsdk-fbsvc-988e726fad.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: "https://mqtt-73b63-default-rtdb.firebaseio.com"
});

const db = admin.database();
const port = 4000;
const wsPort = 5000;

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

		// Store message in Firebase Realtime Database
		try {
			const messageData = {
				clientId: client.id,
				topic: packet.topic,
				payload: packet.payload.toString(),
				timestamp: admin.database.ServerValue.TIMESTAMP,
				date: new Date().toISOString()
			};

			// Store in messages node with auto-generated key
			await db.ref('messages').push(messageData);

			// Also store latest message per topic for easy access
			await db.ref(`topics/${packet.topic.replace(/\//g, '_')}`).set(messageData);

			console.log('Message stored in Firebase successfully');
		} catch (error) {
			console.error('Error storing message in Firebase:', error);
		}
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
