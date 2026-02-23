const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const db = require('./config/database');
const initializeSMSService = require('./services/smsService');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const wardenRoutes = require('./routes/wardens');
const attendanceRoutes = require('./routes/attendance');
const collegeLeaveRoutes = require('./routes/collegeLeave');
const holidayLeaveRoutes = require('./routes/holidayLeave');
const reminderRoutes = require('./routes/reminders');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize SMS Service
const smsService = initializeSMSService();
app.set('smsService', smsService);

// Test database connection
db.query('SELECT 1')
  .then(() => {
    console.log('Database connected successfully');
  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/wardens', wardenRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/college-leave', collegeLeaveRoutes);
app.use('/api/holiday-leave', holidayLeaveRoutes);
app.use('/api/reminders', reminderRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
