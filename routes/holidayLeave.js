const express = require('express');
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

const isValidISODate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Apply for holiday leave (student only)
router.post('/', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const { from_date, to_date, reason } = req.body;

    if (!from_date || !to_date || !reason) {
      return res.status(400).json({ message: 'From date, to date, and reason are required' });
    }

    if (!isValidISODate(from_date) || !isValidISODate(to_date)) {
      return res.status(400).json({ message: 'Dates must be in YYYY-MM-DD format' });
    }

    const fromDate = new Date(`${from_date}T00:00:00`);
    const toDate = new Date(`${to_date}T00:00:00`);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ message: 'Invalid leave dates' });
    }

    if (toDate < fromDate) {
      return res.status(400).json({ message: 'To date cannot be earlier than from date' });
    }

    if (reason.trim().length < 3) {
      return res.status(400).json({ message: 'Reason must be at least 3 characters' });
    }

    // Get student ID
    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    // Insert holiday leave application
    await db.query(
      'INSERT INTO holiday_leave_applications (student_id, from_date, to_date, reason) VALUES (?, ?, ?, ?)',
      [studentId, from_date, to_date, reason.trim()]
    );

    res.status(201).json({ message: 'Holiday leave application submitted successfully' });
  } catch (error) {
    console.error('Holiday leave application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all holiday leave applications (admin and warden only)
router.get('/', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const { status, student_id } = req.query;

    let query = `
      SELECT 
        hla.*,
        s.student_id as student_number,
        s.first_name,
        s.last_name,
        s.room_number,
        s.phone_number,
        u.username as approved_by_username
      FROM holiday_leave_applications hla
      JOIN students s ON hla.student_id = s.id
      LEFT JOIN users u ON hla.approved_by = u.id
      WHERE 1=1
    `;
    
    const params = [];

    if (status) {
      query += ' AND hla.status = ?';
      params.push(status);
    }

    if (student_id) {
      query += ' AND hla.student_id = ?';
      params.push(student_id);
    }

    query += ' ORDER BY hla.applied_at DESC';

    const [applications] = await db.query(query, params);
    res.json(applications);
  } catch (error) {
    console.error('Get holiday leave applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student's own holiday leave applications
router.get('/my-applications', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    const [applications] = await db.query(
      `SELECT 
        hla.*,
        u.username as approved_by_username
       FROM holiday_leave_applications hla
       LEFT JOIN users u ON hla.approved_by = u.id
       WHERE hla.student_id = ?
       ORDER BY hla.applied_at DESC`,
      [studentId]
    );

    res.json(applications);
  } catch (error) {
    console.error('Get my applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve or reject holiday leave application (admin and warden only)
router.put('/:id', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const applicationId = req.params.id;
    const { status, remarks } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Valid status (approved/rejected) is required' });
    }

    const [applications] = await db.query(
      'SELECT id, status FROM holiday_leave_applications WHERE id = ?',
      [applicationId]
    );

    if (applications.length === 0) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (applications[0].status !== 'pending') {
      return res.status(400).json({ message: 'Only pending applications can be reviewed' });
    }

    await db.query(
      `UPDATE holiday_leave_applications 
       SET status = ?, approved_by = ?, reviewed_at = NOW(), remarks = ?
       WHERE id = ?`,
      [status, req.user.id, remarks ? remarks.trim() : null, applicationId]
    );

    res.json({ message: `Application ${status} successfully` });
  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel application (student only - if pending)
router.delete('/:id', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const applicationId = req.params.id;

    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    const result = await db.query(
      'DELETE FROM holiday_leave_applications WHERE id = ? AND student_id = ? AND status = ?',
      [applicationId, studentId, 'pending']
    );

    if (result[0].affectedRows === 0) {
      return res.status(400).json({ message: 'Cannot delete application (not found or already processed)' });
    }

    res.json({ message: 'Application cancelled successfully' });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
