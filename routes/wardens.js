const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// Create warden account (admin only)
router.post('/', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const { username, email, password, first_name, last_name, phone_number } = req.body;

    if (!username || !email || !password || !first_name || !last_name) {
      await connection.rollback();
      return res.status(400).json({ message: 'Required fields are missing' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, 'warden']
    );

    const userId = userResult.insertId;

    await connection.query(
      'INSERT INTO wardens (user_id, first_name, last_name, phone_number) VALUES (?, ?, ?, ?)',
      [userId, first_name, last_name, phone_number]
    );

    await connection.commit();
    res.status(201).json({ message: 'Warden created successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Create warden error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
});

// Get all wardens (admin only)
router.get('/', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const [wardens] = await db.query(`
      SELECT w.*, u.username, u.email
      FROM wardens w
      JOIN users u ON w.user_id = u.id
      ORDER BY w.id
    `);

    res.json(wardens);
  } catch (error) {
    console.error('Get wardens error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get warden profile (own data)
router.get('/me/profile', authMiddleware, roleMiddleware('warden'), async (req, res) => {
  try {
    const [wardens] = await db.query(`
      SELECT w.*, u.username, u.email
      FROM wardens w
      JOIN users u ON w.user_id = u.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (wardens.length === 0) {
      return res.status(404).json({ message: 'Warden profile not found' });
    }

    res.json(wardens[0]);
  } catch (error) {
    console.error('Get warden profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update warden
router.put('/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const wardenId = req.params.id;
    const { first_name, last_name, phone_number } = req.body;

    await db.query(
      'UPDATE wardens SET first_name = ?, last_name = ?, phone_number = ? WHERE id = ?',
      [first_name, last_name, phone_number, wardenId]
    );

    res.json({ message: 'Warden updated successfully' });
  } catch (error) {
    console.error('Update warden error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete warden
router.delete('/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const wardenId = req.params.id;

    const [wardens] = await connection.query('SELECT user_id FROM wardens WHERE id = ?', [wardenId]);
    
    if (wardens.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Warden not found' });
    }

    await connection.query('DELETE FROM users WHERE id = ?', [wardens[0].user_id]);

    await connection.commit();
    res.json({ message: 'Warden deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Delete warden error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
