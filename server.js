require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.supabase_url || process.env.SUPABASE_URL;
const supabaseKey = process.env.supabase_key || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing supabase_url or supabase_key environment variables');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key'
);

const app = express();

const upload = multer({ dest: 'uploads/' });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'qr-attendance-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

async function getMembers() {
  const { data, error } = await supabase.from('members').select('*');
  if (error) throw error;
  return data || [];
}

async function saveMembers(data) {
  const { error: upsertError } = await supabase.from('members').upsert(data, { onConflict: 'id' });
  if (upsertError) throw upsertError;
}

async function getAttendance() {
  const { data, error } = await supabase.from('attendance').select('*');
  if (error) throw error;
  return data || [];
}

async function saveAttendance(data) {
  const { error } = await supabase.from('attendance').insert(data);
  if (error) throw error;
}

function isLoggedIn(req) {
  return req.session.userId === 'admin';
}

app.get('/', (req, res) => {
  if (isLoggedIn(req)) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (isLoggedIn(req)) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const adminUsername = process.env.admin_username || process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.admin_password || process.env.ADMIN_PASSWORD || '1234';
  
  if (username === adminUsername && password === adminPassword) {
    req.session.userId = 'admin';
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/dashboard', (req, res) => {
  if (!isLoggedIn(req)) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  try {
    const members = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');
        members.push({
          id: row.id,
          patient_name: row.patient_name,
          hospital_name: row.hospital_name,
          major: row.major,
          token: token
        });
      })
      .on('end', async () => {
        try {
          await saveMembers(members);
          fs.unlinkSync(req.file.path);
          res.json({ success: true, count: members.length });
        } catch (err) {
          console.error('Save members error:', err);
          fs.unlinkSync(req.file.path);
          res.status(400).json({ success: false, message: 'Error saving to database: ' + err.message });
        }
      })
      .on('error', (err) => {
        fs.unlinkSync(req.file.path);
        res.status(400).json({ success: false, message: 'Error parsing CSV' });
      });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Error uploading file' });
  }
});

app.get('/api/members', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const members = await getMembers();
    res.json({ success: true, members });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching members' });
  }
});

app.get('/api/generate-qr/:id', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const members = await getMembers();
    const member = members.find(m => m.id === req.params.id);
    
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const appUrl = `${req.protocol}://${req.get('host')}`;
    const qrUrl = `${appUrl}/scan?token=${member.token}`;
    const qrImage = await QRCode.toDataURL(qrUrl);
    res.json({ success: true, qrImage });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error generating QR code' });
  }
});

app.get('/api/qr-codes-csv', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const members = await getMembers();
    const appUrl = `${req.protocol}://${req.get('host')}`;
    
    let csv = 'ID,Patient Name,Hospital Name,Major,QR Code URL\n';
    
    for (const member of members) {
      const qrUrl = `${appUrl}/scan?token=${member.token}`;
      csv += `${member.id},"${member.patient_name}","${member.hospital_name}","${member.major}","${qrUrl}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="qr_codes.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error generating QR codes CSV' });
  }
})

app.get('/scan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scan.html'));
});

app.get('/api/member/:token', async (req, res) => {
  try {
    const members = await getMembers();
    const member = members.find(m => m.token === req.params.token);
    
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const attendance = await getAttendance();
    const record = attendance.find(a => a.member_id === member.id);
    const status = record ? 'Present' : 'Invited';
    const time = record ? record.time : '-';

    res.json({
      success: true,
      member,
      status,
      time,
      isLoggedIn: isLoggedIn(req)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching member' });
  }
});

app.post('/api/mark-present/:token', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized - Please login first' });
  }

  try {
    const members = await getMembers();
    const member = members.find(m => m.token === req.params.token);

    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const attendance = await getAttendance();
    const existingRecord = attendance.find(a => a.member_id === member.id);

    if (existingRecord) {
      return res.status(400).json({ success: false, message: 'Already marked present' });
    }

    const record = {
      member_id: member.id,
      patient_name: member.patient_name,
      hospital_name: member.hospital_name,
      major: member.major,
      status: 'Present',
      time: new Date().toLocaleString()
    };

    await saveAttendance([record]);

    res.json({ success: true, message: 'Marked present successfully' });
  } catch (err) {
    console.error('Mark present error:', err);
    res.status(500).json({ success: false, message: 'Error marking present: ' + err.message });
  }
});

app.get('/api/attendance', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const attendance = await getAttendance();
    res.json({ success: true, attendance });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching attendance' });
  }
});

app.get('/api/attendance-csv', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const attendance = await getAttendance();
    let csv = 'ID,Patient Name,Hospital Name,Major,Status,Time\n';
    
    attendance.forEach(record => {
      csv += `${record.member_id},"${record.patient_name}","${record.hospital_name}","${record.major}",${record.status},"${record.time}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error generating CSV' });
  }
});

app.get('/attendance', (req, res) => {
  if (!isLoggedIn(req)) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'attendance.html'));
});

app.get('/admin', (req, res) => {
  if (!isLoggedIn(req)) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/generate-ticket-qr/:token', async (req, res) => {
  try {
    const appUrl = `${req.protocol}://${req.get('host')}`;
    const ticketUrl = `${appUrl}/scan?token=${req.params.token}`;
    const qrImage = await QRCode.toDataURL(ticketUrl);
    res.json({ success: true, qrImage });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error generating ticket QR' });
  }
});

app.post('/api/add-attendance', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { member_id, patient_name, hospital_name, major } = req.body;
    const record = {
      member_id,
      patient_name,
      hospital_name,
      major,
      status: 'Present',
      time: new Date().toLocaleString()
    };

    await saveAttendance([record]);
    res.json({ success: true, message: 'Record added successfully' });
  } catch (err) {
    console.error('Add attendance error:', err);
    res.status(500).json({ success: false, message: 'Error adding record: ' + err.message });
  }
});

app.put('/api/update-attendance/:id', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { patient_name, hospital_name, major } = req.body;
    const { data, error } = await supabase
      .from('attendance')
      .update({
        patient_name,
        hospital_name,
        major
      })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Record updated successfully' });
  } catch (err) {
    console.error('Update attendance error:', err);
    res.status(500).json({ success: false, message: 'Error updating record: ' + err.message });
  }
});

app.delete('/api/delete-attendance/:id', async (req, res) => {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (err) {
    console.error('Delete attendance error:', err);
    res.status(500).json({ success: false, message: 'Error deleting record: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`QR Attendance System running on http://localhost:${PORT}`);
});
