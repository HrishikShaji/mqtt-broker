import aedes from 'aedes';
import { createServer } from 'net';
import http from 'http';
import ws from 'websocket-stream';
import admin from 'firebase-admin';
import {
	PROJECT_ID,
	PRIVATE_KEY,
	CLIENT_EMAIL,
	TYPE,
	PRIVATE_KEY_ID,
	CLIENT_ID,
	AUTH_URI,
	TOKEN_URI,
	AUTH_PROVIDER_CERT_URL,
	CLIENT_CERT_URL,
	UNIVERSE_DOMAIN
} from './lib/variables.js';
import { DATABASE_URL } from './lib/variables.js';

const aedesInstance = aedes();
const server = createServer(aedesInstance.handle);

const firebase = {
	type: TYPE,
	project_id: PROJECT_ID,
	private_key_id: PRIVATE_KEY_ID,
	private_key: PRIVATE_KEY.replace(/\\n/g, '\n'),
	client_email: CLIENT_EMAIL,
	client_id: CLIENT_ID,
	auth_uri: AUTH_URI,
	token_uri: TOKEN_URI,
	auth_provider_x509_cert_url: AUTH_PROVIDER_CERT_URL,
	client_x509_cert_url: CLIENT_CERT_URL,
	universe_domain: UNIVERSE_DOMAIN
};


// Initialize Firebase Admin
try {
	admin.initializeApp({
		credential: admin.credential.cert(firebase),
		databaseURL: DATABASE_URL
	});
	console.log("Firebase initialized successfully");
} catch (error) {
	console.error("Firebase initialization error:", error);
	process.exit(1);
}

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
			timestamp: new Date().toISOString(),
			clients_connected: Object.keys(aedesInstance.clients).length
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
ws.createServer({ server: httpServer }, aedesInstance.handle);
httpServer.listen(port, '0.0.0.0', function() {
	console.log(`HTTP/WebSocket server started on port ${port}`);
});

// Event handlers - FIXED: Removed duplicate 'client' handler
aedesInstance.on('client', function(client) {
	console.log(`Client ${client.id} connected`);

	// Optional: Store client connection info
	const connectionData = {
		clientId: client.id,
		connected: true,
		timestamp: admin.database.ServerValue.TIMESTAMP,
		date: new Date().toISOString()
	};

	db.ref(`clients/${client.id}`).set(connectionData).catch(error => {
		console.error('Error storing client connection:', error);
	});
});

aedesInstance.on('clientDisconnect', function(client) {
	console.log(`Client ${client.id} disconnected`);

	// Optional: Update client disconnection info
	const disconnectionData = {
		clientId: client.id,
		connected: false,
		timestamp: admin.database.ServerValue.TIMESTAMP,
		date: new Date().toISOString()
	};

	db.ref(`clients/${client.id}`).update(disconnectionData).catch(error => {
		console.error('Error updating client disconnection:', error);
	});
});

aedesInstance.on('publish', async function(packet, client) {
	if (client) {
		console.log(`Message from ${client.id}: ${packet.topic} -> ${packet.payload.toString()}`);
		console.log('Packet details:', {
			cmd: packet.cmd,
			retain: packet.retain,
			qos: packet.qos,
			dup: packet.dup,
			length: packet.length,
			topic: packet.topic,
			payload: packet.payload.toString('hex').substring(0, 100)
		});
		// Store message in Firebase Realtime Database
		try {
			const messageData = {
				clientId: client.id,
				topic: packet.topic,
				payload: packet.payload.toString(),
				timestamp: admin.database.ServerValue.TIMESTAMP,
				date: new Date().toISOString(),
				qos: packet.qos,
				retain: packet.retain
			};

			// Store in messages node with auto-generated key
			await db.ref('messages').push(messageData);

			// Also store latest message per topic for easy access
			const sanitizedTopic = packet.topic.replace(/[.#$\[\]]/g, '_');
			await db.ref(`topics/${sanitizedTopic}`).set(messageData);

			console.log('Message stored in Firebase successfully');
		} catch (error) {
			console.error('Error storing message in Firebase:', error);
		}
	}
});

aedesInstance.on('subscribe', function(subscriptions, client) {
	console.log(`Client ${client.id} subscribed to:`, subscriptions.map(s => s.topic));

	// Optional: Store subscription info
	const subscriptionData = {
		clientId: client.id,
		subscriptions: subscriptions.map(s => ({ topic: s.topic, qos: s.qos })),
		timestamp: admin.database.ServerValue.TIMESTAMP,
		date: new Date().toISOString()
	};

	db.ref(`subscriptions/${client.id}`).set(subscriptionData).catch(error => {
		console.error('Error storing subscription info:', error);
	});
});

aedesInstance.on('unsubscribe', function(unsubscriptions, client) {
	console.log(`Client ${client.id} unsubscribed from:`, unsubscriptions);
});

// Error handling
aedesInstance.on('clientError', function(client, err) {
	console.error(`Client ${client ? client.id : 'unknown'} error:`, err);
});

aedesInstance.on('connectionError', function(client, err) {
	console.error(`Connection error from ${client ? client.id : 'unknown'}:`, err);
});

// Graceful shutdown
function gracefulShutdown() {
	console.log('Shutting down MQTT broker...');

	// Close servers
	server.close((err) => {
		if (err) console.error('Error closing MQTT server:', err);
		else console.log('MQTT server closed');
	});

	httpServer.close((err) => {
		if (err) console.error('Error closing HTTP server:', err);
		else console.log('HTTP server closed');
	});

	// Close Firebase connection
	admin.app().delete().then(() => {
		console.log('Firebase connection closed');
		process.exit(0);
	}).catch((error) => {
		console.error('Error closing Firebase connection:', error);
		process.exit(1);
	});
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
