const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEMAND_OPTIONS = [
  '40-Min Breaks & Class Reset',
  'Climate Protection & Cooling',
  'Anti-Paper Leak Security',
  'Daily Homework Time Caps',
  'End Demeaning Micro-management',
  'Something else entirely'
];

let signersCollection = null;

async function connectDB() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it in your Render environment variables.');
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('fomu');
    signersCollection = db.collection('signers');
    await signersCollection.createIndex({ createdAt: -1 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }
}

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

// GET current signature count + most recent signers
app.get('/api/petition/stats', async (req, res) => {
  if (!signersCollection) {
    return res.status(503).json({ error: 'Database is not connected yet. Try again shortly.' });
  }
  try {
    const count = await signersCollection.countDocuments();
    const recentDocs = await signersCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const recent = recentDocs.map((s) => ({
      name: s.name,
      school: s.school,
      complaint: s.complaint,
      createdAt: s.createdAt
    }));

    res.json({ count, recent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load petition stats.' });
  }
});

// POST a new signature
app.post('/api/petition/sign', async (req, res) => {
  if (!signersCollection) {
    return res.status(503).json({ error: 'Database is not connected yet. Try again shortly.' });
  }
  try {
    const name = sanitizeText(req.body && req.body.name, 60);
    const school = sanitizeText(req.body && req.body.school, 80);
    let complaint = sanitizeText(req.body && req.body.complaint, 60);

    if (!name || !school) {
      return res.status(400).json({ error: 'Name and grade/school are required.' });
    }
    if (!DEMAND_OPTIONS.includes(complaint)) {
      complaint = 'Something else entirely';
    }

    const doc = { name, school, complaint, createdAt: new Date() };
    await signersCollection.insertOne(doc);
    const count = await signersCollection.countDocuments();

    res.status(201).json({ count, signer: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save your signature. Please try again.' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, dbConnected: !!signersCollection });
});

connectDB().catch((err) => console.error('connectDB error:', err));

app.listen(PORT, () => {
  console.log(`FOMU server running on port ${PORT}`);
});
