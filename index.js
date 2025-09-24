const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const http = require('http');
const ws = require('websocket-stream');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require("./mqtt-73b63-firebase-adminsdk-fbsvc-c65e4564a8.json");
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: "https://mqtt-73b63-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Use Render's PORT environment variable
const port = process.env.PORT || 4000;
const mqttPort = 1883; // Standard MQTT port for internal use

// Create HTTP server that handles both WebSocket and health checks
const httpServer = http.createServer((req, res) => {
	// Handle health check requests
	if (req.url === '/health' || req.url === '/') {
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(JSON.stringify({
			status: 'healthy',
			mqtt_port: mqttPort,
			websocket_port: port,
			timestamp: new Date().toISOString()
		}));
	} else {
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	}
});

// MQTT over TCP (use different port from HTTP)
server.listen(mqttPort, '0.0.0.0', function() {
	console.log(`MQTT Broker started on port ${mqttPort}`);
});

// MQTT over WebSocket + HTTP health check on Render's required port
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(port, '0.0.0.0', function() {
	console.log(`HTTP/WebSocket server started on port ${port}`);
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
