const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');



// Route for user registration
router.post('/register', async (req, res) => {
    const { full_name, email, username, password, confirm_password, secret_question, secret_answer, bitcoin_address, referral_code } = req.body;

    // Validate input
    if (password !== confirm_password) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
        // Hash the password
        const password_hash = await bcrypt.hash(password, 10);

        // Insert user into the database
        const query = 'INSERT INTO users (full_name, email, username, password_hash, secret_question, secret_answer, bitcoin_address, referral_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        connection.query(query, [full_name, email, username, password_hash, secret_question, secret_answer, bitcoin_address, referral_code], (error, results) => {
            if (error) {
                console.error('Error inserting user into the database:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }

            res.status(201).json({ message: 'User created successfully' });
        });
    } catch (error) {
        console.error('Error processing registration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route for user sign-in
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Fetch user from the database
        const query = 'SELECT * FROM users WHERE email = ?';
        connection.query(query, [email], async (error, results) => {
            if (error) {
                console.error('Error fetching user from database:', error);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (results.length === 0) {
                return res.status(400).json({ error: 'Invalid email or password' });
            }

            const user = results[0];

            // Compare passwords
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return res.status(400).json({ error: 'Invalid email or password' });
            }

            // Generate JWT token
            const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

            res.json({ message: 'Login successful', token });
        });
    } catch (error) {
        console.error('Error processing login:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
