-- Create Database
CREATE DATABASE IF NOT EXISTS hostel_management;
USE hostel_management;

-- Users Table (for authentication)
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'warden', 'admin') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_role (role)
);

-- Students Table (personal details)
CREATE TABLE IF NOT EXISTS students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE NOT NULL,
  student_id VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  phone_number VARCHAR(15),
  emergency_contact VARCHAR(15),
  parent_name VARCHAR(100),
  parent_phone VARCHAR(15),
  address TEXT,
  room_number VARCHAR(20),
  rfid_tag VARCHAR(100) UNIQUE,
  blood_group VARCHAR(5),
  medical_conditions TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_student_id (student_id),
  INDEX idx_rfid_tag (rfid_tag)
);

-- Wardens Table
CREATE TABLE IF NOT EXISTS wardens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(15),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Attendance Logs Table (RFID logging)
CREATE TABLE IF NOT EXISTS attendance_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  log_type ENUM('entry', 'exit') NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  rfid_tag VARCHAR(100),
  INDEX idx_student_id (student_id),
  INDEX idx_timestamp (timestamp),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- College Leave Status Table (daily leave to college)
CREATE TABLE IF NOT EXISTS college_leave_status (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('inside_hostel', 'at_college') DEFAULT 'at_college',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_date (student_id, date),
  INDEX idx_date (date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Holiday Leave Applications Table
CREATE TABLE IF NOT EXISTS holiday_leave_applications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  approved_by INT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  remarks TEXT,
  INDEX idx_student_id (student_id),
  INDEX idx_status (status),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Reminder Settings Table
CREATE TABLE IF NOT EXISTS reminder_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  reminder_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- SMS Logs Table
CREATE TABLE IF NOT EXISTS sms_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  phone_number VARCHAR(15) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('sent', 'failed') NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_id (student_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Insert default super admin
-- Password: admin123 (hashed with bcrypt)
INSERT INTO users (username, email, password, role) 
VALUES ('admin', 'admin@hostel.com', '$2a$10$XQKz8qYLhKvVYKyQxJQZ3OGKvJCvYxKQZDxH5VpV6YQqH5qH5qH5q', 'admin')
ON DUPLICATE KEY UPDATE username=username;

-- Insert default reminder setting (8:00 PM)
INSERT INTO reminder_settings (reminder_time, is_active, created_by)
SELECT '20:00:00', true, id FROM users WHERE role='admin' LIMIT 1
ON DUPLICATE KEY UPDATE reminder_time=reminder_time;
