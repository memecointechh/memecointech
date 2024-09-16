const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2'); 
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,  
    queueLimit: 0         
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false, // use SSL
    auth: {
      user: 'memecointech@hotmail.com',
      pass: 'Samuelfelicia@2002'
    }
});

app.post('/api/auth/register', (req, res) => {
  const { full_name, email, username, password, secret_question, secret_answer, bitcoin_address, referral_code } = req.body;

  // Validate input
  if (!full_name || !email || !username || !password || !secret_question || !secret_answer) {
    return res.status(400).json({ message: 'Please fill in all required fields.' });
  }

  // Check if referral code exists
  let referrerId = null;
  if (referral_code) {
    pool.query('SELECT id FROM users WHERE referral_code = ?', [referral_code], (error, results) => {
      if (error) {
        console.error('Error checking referral code:', error);
        return res.status(500).json({ message: 'Error registering user.' });
      }

      if (results.length > 0) {
        referrerId = results[0].id;
      }

      // Insert user into database
      pool.query(
        'INSERT INTO users (full_name, email, username, password, secret_question, secret_answer, bitcoin_address, referral_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [full_name, email, username, password, secret_question, secret_answer, bitcoin_address, referral_code],
        (error, results) => {
          if (error) {
            console.error('Error inserting user into the database:', error);
            return res.status(500).json({ message: 'Error registering user.' });
          }

          // Redirect to login page
          res.redirect('/signin.html');
        }
      );
    });
  } else {
    // Insert user into database without referral
    pool.query(
      'INSERT INTO users (full_name, email, username, password, secret_question, secret_answer, bitcoin_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [full_name, email, username, password, secret_question, secret_answer, bitcoin_address],
      (error, results) => {
        if (error) {
          console.error('Error inserting user into the database:', error);
          return res.status(500).json({ message: 'Error registering user.' });
        }

        // Redirect to login page
        res.redirect('/signin.html');
      }
    );
  }
});



// Route for user login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check if the user is an admin
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        return res.redirect('/admindash.html');
    }

    // Query to check if the user is a regular user
    const query = 'SELECT * FROM users WHERE email = ? AND password = ?';
    pool.query(query, [email, password], (error, results) => {
        if (error) {
            console.error('Error querying the database:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.length > 0) {
            // User authenticated successfully
            const user = results[0]; // Assuming the first result is the user
            res.json({
                message: 'Login successful',
                username: user.username // Send username in response
            });
        } else {
            // Authentication failed
            res.status(401).json({ error: 'Invalid email or password' });
        }
    });
});



  app.get('/users', (req, res) => {
    const username = req.query.username;
    const db = mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  
    db.connect((err) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: 'Error connecting to database' });
      } else {
        db.query(`SELECT * FROM users WHERE username = ?`, [username], (err, rows) => {
          if (err) {
            console.error(err);
            res.status(500).json({ message: 'Error retrieving user data' });
          } else {
            console.log(rows); // Log retrieved data in terminal
            rows.forEach((row) => {
              row.days_since_creation = Math.floor((new Date() - new Date(row.created_at)) / (1000 * 60 * 60 * 24));
              row.created_at = row.created_at.toISOString().split('T')[0]; // Format the created_at timestamp to only show the date
            });
            res.json(rows);
            db.end();
          }
        });
      }
    });
  });


  app.post('/api/deposit', async (req, res) => {
    try {
      const { 
        username, 
        depositAmount, 
        planName, 
        planPrincipleReturn, 
        planCreditAmount, 
        planDepositFee, 
        planDebitAmount, 
        depositMethod 
      } = req.body;
  
      // Validate request body
      if (!username || !planName || !planCreditAmount || !depositAmount || !depositMethod) {
        return res.status(400).json({ message: "Please provide all required fields" });
      }
  
      // Check if user exists
      const [userResult] = await pool.promise().query('SELECT * FROM users WHERE username = ?', [username]);
      const user = userResult[0]; // Select the first user
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Handle balance deduction if deposit method is balance
      if (depositMethod === 'balance') {
        if (user.balance < depositAmount) {
          return res.status(400).json({ message: 'Insufficient balance' });
        }
        
        // Deduct the deposit amount from user's balance
        await pool.promise().query('UPDATE users SET balance = balance - ? WHERE username = ?', [depositAmount, username]);
      }
  
      // Calculate investment end date based on plan
      const planEndTimes = {
        '20% RIO AFTER 48 HOURS': 48 * 60 * 60 * 1000, // 48 hours in milliseconds
        '50% RIO AFTER 72 HOURS': 72 * 60 * 60 * 1000, // 72 hours in milliseconds
        '100% RIO AFTER 96 HOURS': 96 * 60 * 60 * 1000, // 96 hours in milliseconds
        '200% RIO AFTER 120 HOURS': 120 * 60 * 60 * 1000 // 120 hours in milliseconds
      };
  
      const investmentStartDate = new Date();
      const investmentEndDate = new Date(investmentStartDate.getTime() + (planEndTimes[planName] || 0));
  
      // Insert a new transaction into the transactions table
      await pool.promise().query(
        `INSERT INTO transactions 
         (username, plan_name, plan_principle_return, plan_credit_amount, plan_deposit_fee, plan_debit_amount, deposit_method, transaction_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [username, planName, planPrincipleReturn, planCreditAmount, planDepositFee, planDebitAmount, depositMethod]
      );
  
      // Insert the same details into the deposits table
      await pool.promise().query(
        `INSERT INTO deposits 
         (user_id, amount, date, investment_start_date, investment_end_date, plan_name, plan_principle_return, plan_credit_amount, plan_deposit_fee, plan_debit_amount, deposit_method, status) 
         VALUES ((SELECT id FROM users WHERE username = ?), ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [username, depositAmount, investmentStartDate, investmentEndDate, planName, planPrincipleReturn, planCreditAmount, planDepositFee, planDebitAmount, depositMethod]
      );
  
      res.json({ success: true, message: 'Deposit successful' });
    } catch (err) {
      console.error('Error processing deposit:', err); // Enhanced error logging
      res.status(500).json({ message: 'Error processing deposit' });
    }
  });
  


  
  const checkInvestmentEnd = async () => {
    try {
      const now = new Date();
  
      // Find deposits where the end date has passed
      const [deposits] = await pool.promise().query(
        `SELECT * FROM deposits 
         WHERE investment_end_date <= ? AND status = 'pending'`,
        [now]
      );
  
      for (const deposit of deposits) {
        // Update user's balance
        await pool.promise().query(
          `UPDATE users 
           SET balance = balance + ?, total_deposits = total_deposits + ? 
           WHERE id = ?`,
          [deposit.amount, deposit.amount, deposit.user_id]
        );
  
        // Update deposit status to 'completed'
        await pool.promise().query(
          `UPDATE deposits 
           SET status = 'completed' 
           WHERE id = ?`,
          [deposit.id]
        );
      }
  
      console.log('Investment end check completed.');
    } catch (err) {
      console.error('Error checking investments:', err);
    }
  };


// Route to get the number of recent investment packages
app.get('/api/admin/recent-investments', (req, res) => {
  // Query to count recent investments from the last 3 days
  const query = `
      SELECT COUNT(*) AS recent_investments
      FROM investments
      WHERE start_date >= NOW() - INTERVAL 3 DAY;
  `;

  // Execute the query
  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Error fetching recent investments' });
      }

      // Send the count of recent investments as JSON
      res.json({ recent_investments: results[0].recent_investments });
  });
});

// Endpoint to get the count of pending deposits
app.get('/api/admin/pending-deposits/count', (req, res) => {
  const query = 'SELECT COUNT(*) AS pending_deposits FROM deposits WHERE status = ?';
  
  pool.query(query, ['pending'], (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Error fetching pending deposits count' });
      }
      
      // Send the count as a JSON response
      res.json(results[0]);
  });
});


app.get('/api/admin/pending-deposits', (req, res) => {
  const query = 'SELECT id, user_id, amount, plan_name, status, date FROM deposits WHERE status = ?';
  
  pool.query(query, ['pending'], (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Error fetching pending deposits' });
      }
      
      res.json(results);
  });
});

/// Approve a deposit
app.post('/api/admin/approve-deposit', async (req, res) => {
  const { depositId } = req.body;

  try {
    // Get the deposit details including the plan name
    const [deposit] = await pool.promise().query('SELECT * FROM deposits WHERE id = ?', [depositId]);

    if (!deposit.length) {
      return res.status(404).json({ message: 'Deposit not found' });
    }

    const { user_id, amount, plan_name, investment_start_date } = deposit[0];

    // Get the corresponding plan details (duration and profit) from the plans table
    const [plan] = await pool.promise().query('SELECT duration, profit FROM plans WHERE name = ?', [plan_name]);

    if (!plan.length) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    const { duration, profit } = plan[0];

    // Calculate the investment end date based on the plan's duration
    const startDate = new Date(investment_start_date);
    const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);

    // Calculate the profit based on the interest percentage
    const interest = amount * (profit / 100);

    // Update the deposit status to "approved"
    await pool.promise().query('UPDATE deposits SET status = ? WHERE id = ?', ['approved', depositId]);

    // Insert the details into the active_deposits table, including the calculated profit
    await pool.promise().query(
      `INSERT INTO active_deposits (user_id, amount, interest, plan_name, profit, investment_start_date, investment_end_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, amount, interest, plan_name, profit, startDate, endDate]
    );

    res.json({ message: 'Deposit approved and moved to active deposits successfully' });
  } catch (err) {
    console.error('Error approving deposit:', err);
    res.status(500).json({ message: 'Error approving deposit' });
  }
});




// Reject a deposit
app.post('/api/admin/reject-deposit', (req, res) => {
  const { depositId } = req.body;

  // Move deposit to rejected_deposits
  pool.query(
    'INSERT INTO rejected_deposits (id, user_id, amount, status, date) SELECT id, user_id, amount, status, date FROM deposits WHERE id = ?',
    [depositId],
    (err) => {
      if (err) {
        console.error('Error moving deposit to rejected_deposits:', err);
        return res.status(500).json({ message: 'Error moving deposit to rejected_deposits' });
      }

      // Remove the deposit from the deposits table
      pool.query('DELETE FROM deposits WHERE id = ?', [depositId], (err) => {
        if (err) {
          console.error('Error deleting deposit from deposits table:', err);
          return res.status(500).json({ message: 'Error deleting deposit from deposits table' });
        }

        res.json({ message: 'Deposit rejected successfully' });
      });
    }
  );
});


// Route to get the total amount withdrawn by all users
app.get('/api/admin/total-withdrawals', (req, res) => {
  const query = 'SELECT SUM(amount) AS totalWithdrawals FROM withdrawals';

  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }
      
      res.json({ totalWithdrawals: results[0].totalWithdrawals || 0 });
  });
});


// Route to get the total amount deposited by all users
app.get('/api/admin/total-deposits', (req, res) => {
  const query = 'SELECT SUM(amount) AS totalDeposits FROM deposits';

  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }
      
      res.json({ totalDeposits: results[0].totalDeposits || 0 });
      
  });
});


// Route to get the total available balance for all users
app.get('/api/admin/total-balance', (req, res) => {
  const query = 'SELECT SUM(balance) AS totalBalance FROM users';

  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }
      
      res.json({ totalBalance: results[0].totalBalance || 0 });
      
  });
});



// Route to fetch bitcoin_address and balance on page load
app.get('/api/user-info', (req, res) => {
  const { username } = req.query; // Username will be sent from the frontend

  pool.query(
      'SELECT bitcoin_address, balance FROM users WHERE username = ?',
      [username],
      (error, results) => {
          if (error) {
              console.error('Error fetching user info:', error);
              return res.status(500).json({ message: 'Error fetching user info.' });
          }
          if (results.length === 0) {
              return res.status(404).json({ message: 'User not found.' });
          }
          const userInfo = results[0];
          res.json(userInfo); // Send the bitcoin_address and balance
      }
  );
});

// Route to handle withdrawal requests
app.post('/api/withdraw', (req, res) => {
  const { username, amount } = req.body;

  // Step 1: Insert withdrawal request into pending_withdrawals table
  pool.query(
      'INSERT INTO pending_withdrawals (username, amount) VALUES (?, ?)',
      [username, amount],
      (error, results) => {
          if (error) {
              console.error('Error inserting withdrawal request:', error);
              return res.status(500).json({ message: 'Error processing withdrawal.' });
          }

          // Step 2: Subtract the withdrawn amount from the user's balance
          pool.query(
              'UPDATE users SET balance = balance - ? WHERE username = ?',
              [amount, username],
              (error, results) => {
                  if (error) {
                      console.error('Error updating balance:', error);
                      return res.status(500).json({ message: 'Error updating balance.' });
                  }
                  res.json({ message: 'Withdrawal request submitted successfully. Your is still pending until Admin confirms statistics' });
              }
          );
      }
  );
});


// Route to get the count of pending deposits
app.get('/api/admin/pending-deposits/count', (req, res) => {
    pool.query(
        'SELECT COUNT(*) AS count FROM pending_deposits',
        (error, results) => {
            if (error) {
                console.error('Error fetching pending deposits count:', error);
                return res.status(500).json({ message: 'Error fetching pending deposits count' });
            }
            const count = results[0].count;
            res.json({ count });
        }
    );
});

// Route to get the count of pending withdrawals
app.get('/api/pending-withdrawals-count', (req, res) => {
  pool.query('SELECT COUNT(*) AS count FROM pending_withdrawals WHERE status = ?', ['pending'], (error, results) => {
      if (error) {
          console.error('Error fetching pending withdrawals count:', error);
          return res.status(500).json({ message: 'Error fetching count' });
      }
      res.json({ count: results[0].count });
  });
});



// Route to get all pending withdrawals for admin
app.get('/api/admin/pending-withdrawals', (req, res) => {
  const query = 'SELECT * FROM pending_withdrawals WHERE status = ?';
  pool.query(query, ['pending'], (error, results) => {
      if (error) {
          console.error('Error fetching pending withdrawals:', error);
          return res.status(500).json({ message: 'Error fetching pending withdrawals' });
      }
      res.json(results);
  });
});


app.get('/api/pending-withdrawals', (req, res) => {
  pool.query('SELECT * FROM pending_withdrawals', (error, results) => {
      if (error) {
          console.error('Error fetching pending withdrawals:', error);
          return res.status(500).json({ message: 'Error fetching pending withdrawals' });
      }
      res.json(results);
  });
});

// Route to get the total number of users
app.get('/api/admin/total-users', (req, res) => {
  pool.query('SELECT COUNT(*) AS total_users FROM users', (error, results) => {
      if (error) {
          console.error('Error fetching total users:', error);
          return res.status(500).json({ message: 'Error fetching total users.' });
      }
      res.json(results[0]);
  });
});


// Route to get all users' details
app.get('/api/admin/users', (req, res) => {
  const query = `
      SELECT id, full_name, email, username, bitcoin_address, referral_code, created_at, balance, total_withdrawals, total_deposits
      FROM users
  `;
  pool.query(query, (error, results) => {
      if (error) {
          console.error('Error fetching user details:', error);
          return res.status(500).json({ message: 'Error fetching user details.' });
      }
      res.json(results);
  });
});


// Route to approve a pending withdrawal
app.post('/api/admin/approve-withdrawal', (req, res) => {
  const { id, username, amount } = req.body;

  // Update status to 'approved' in the pending_withdrawals table
  pool.query('UPDATE pending_withdrawals SET status = ? WHERE id = ?', ['approved', id], (error, result) => {
      if (error) {
          console.error('Error approving withdrawal:', error);
          return res.status(500).json({ message: 'Error approving withdrawal' });
      }

      // Subtract amount from user's balance
      pool.query('UPDATE users SET balance = balance - ? WHERE username = ?', [amount, username], (err, updateResult) => {
          if (err) {
              console.error('Error updating user balance:', err);
              return res.status(500).json({ message: 'Error updating user balance' });
          }
          res.json({ message: 'Withdrawal approved successfully!' });
      });
  });
});

// Route to reject a pending withdrawal
app.post('/api/admin/reject-withdrawal', (req, res) => {
  const { id, username, amount } = req.body;

  // Update status to 'rejected'
  pool.query('UPDATE pending_withdrawals SET status = ? WHERE id = ?', ['rejected', id], (error, result) => {
      if (error) {
          console.error('Error rejecting withdrawal:', error);
          return res.status(500).json({ message: 'Error rejecting withdrawal' });
      }

      // Refund the amount back to the user's balance
      pool.query('UPDATE users SET balance = balance + ? WHERE username = ?', [amount, username], (err, updateResult) => {
          if (err) {
              console.error('Error updating user balance:', err);
              return res.status(500).json({ message: 'Error updating user balance' });
          }
          res.json({ message: 'Withdrawal rejected and amount refunded successfully!' });
      });
  });
});






// Function to check for completed investments
async function checkCompletedInvestments() {
  try {
    // Get the current date
    const currentDate = new Date();
    
    // Query for completed investments
    const [completedDeposits] = await pool.promise().query(
      'SELECT * FROM active_deposits WHERE investment_end_date <= ?',
      [currentDate]
    );

    for (const deposit of completedDeposits) {
      const { user_id, amount, interest, plan_name, investment_end_date } = deposit;

      // Update the user's balance
      await pool.promise().query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [amount + interest, user_id]
      );

      // Archive the completed deposit
      await pool.promise().query(
        'INSERT INTO completed_deposits (user_id, amount, interest, plan_name, investment_start_date, investment_end_date) VALUES (?, ?, ?, ?, ?, ?)',
        [user_id, amount, interest, plan_name, deposit.investment_start_date, investment_end_date]
      );

      // Delete the deposit from active_deposits
      await pool.promise().query(
        'DELETE FROM active_deposits WHERE id = ?',
        [deposit.id]
      );
    }

    console.log('Completed investments processed successfully');
  } catch (err) {
    console.error('Error processing completed investments:', err);
  }
}

// Schedule the cron job to run every hour
cron.schedule('0 * * * *', () => {
  console.log('Running scheduled task to check completed investments');
  checkCompletedInvestments();
});


app.get('/api/user-dashboard', async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    // Fetch data from all relevant tables
    const [activeDepositResult] = await pool.promise().query(
      'SELECT amount FROM active_deposits WHERE user_id = (SELECT id FROM users WHERE username = ?) ORDER BY investment_end_date DESC LIMIT 1',
      [username]
    );
    const mostRecentActiveDeposit = activeDepositResult.length > 0 ? activeDepositResult[0].amount : 0;

    const [pendingWithdrawalsResult] = await pool.promise().query(
      'SELECT SUM(amount) AS totalPendingWithdrawals FROM pending_withdrawals WHERE username = ? AND status = "pending"',
      [username]
    );
    const totalPendingWithdrawals = pendingWithdrawalsResult[0].totalPendingWithdrawals || 0;

    const [totalWithdrawnResult] = await pool.promise().query(
      'SELECT SUM(amount) AS totalWithdrawn FROM pending_withdrawals WHERE username = ? AND status = "approved"',
      [username]
    );
    const totalWithdrawn = totalWithdrawnResult[0].totalWithdrawn || 0;

    const [totalEarnedResult] = await pool.promise().query(
      'SELECT SUM(amount) AS totalEarned FROM earnings WHERE user_id = (SELECT id FROM users WHERE username = ?)',
      [username]
    );
    const totalEarned = totalEarnedResult[0].totalEarned || 0;

    const [lastDepositResult] = await pool.promise().query(
      'SELECT amount FROM deposits WHERE user_id = (SELECT id FROM users WHERE username = ?) ORDER BY date DESC LIMIT 1',
      [username]
    );
    const lastDeposit = lastDepositResult.length > 0 ? lastDepositResult[0].amount : 0;

    const [totalDepositsResult] = await pool.promise().query(
      'SELECT total_deposits FROM users WHERE username = ?',
      [username]
    );
    const totalDeposits = totalDepositsResult.length > 0 ? totalDepositsResult[0].total_deposits : 0;

    const [lastWithdrawalResult] = await pool.promise().query(
      'SELECT amount FROM pending_withdrawals WHERE username = ? ORDER BY request_date DESC LIMIT 1',
      [username]
    );
    const lastWithdrawal = lastWithdrawalResult.length > 0 ? lastWithdrawalResult[0].amount : 0;

    // Send the response with all the data
    res.json({
      mostRecentActiveDeposit,
      totalPendingWithdrawals,
      totalWithdrawn,
      totalEarned,
      lastDeposit,
      totalDeposits,
      lastWithdrawal
    });
  } catch (err) {
    console.error('Error fetching user dashboard data:', err);
    res.status(500).json({ message: 'Error fetching user dashboard data' });
  }
});


// Endpoint to get user details
app.get('/api/admin/user-details', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Fetch user details from the database
    const [result] = await pool.promise().query(
      'SELECT id, full_name, email, username, bitcoin_address, referral_code, created_at, balance, total_withdrawals, total_deposits FROM users WHERE id = ?',
      [userId]
    );

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send the user details as the response
    res.json(result[0]);
  } catch (err) {
    console.error('Error fetching user details:', err);
    res.status(500).json({ message: 'Error fetching user details' });
  }
});
 


// Route to handle adding a penalty
app.post('/api/admin/add-penalty', async (req, res) => {
  const { userId, penaltyAmount, penaltyType, description, authPassword } = req.body;

  if (authPassword !== 'AdMiN') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // Find user by userId
    const [user] = await pool.promise().query('SELECT * FROM users WHERE id = ?', [userId]);

    if (user.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Deduct penalty from the user's balance
    const newBalance = user[0].balance - parseFloat(penaltyAmount);

    // Update user's balance
    await pool.promise().query('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);

    // Log penalty in penalties table
    await pool.promise().query('INSERT INTO penalties (user_id, amount, type, description) VALUES (?, ?, ?, ?)', [
        userId,
        penaltyAmount,
        penaltyType,
        description
    ]);

    // Send success response
    res.json({ success: true });

  } catch (error) {
    console.error('Error adding penalty:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// Function to add a bonus
app.post('/api/admin/add-bonus', (req, res) => {
  const { userId, bonusAmount, bonusType, reason, authPassword } = req.body;

  // Validate the input
  if (!userId || !bonusAmount || !bonusType || !reason || !authPassword) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // Convert bonusAmount to a number
  const amount = parseFloat(bonusAmount);
  if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid bonus amount' });
  }

  // Check if the user exists
  pool.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
      if (err) {
          console.error('Error fetching user details:', err);
          return res.status(500).json({ success: false, message: 'Server error' });
      }

      if (results.length === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = results[0];
      // Convert user's balance to a number
      const currentBalance = parseFloat(user.balance);
      if (isNaN(currentBalance)) {
          return res.status(500).json({ success: false, message: 'Error with user balance' });
      }

      const newBalance = currentBalance + amount;

      console.log(`User found: ${JSON.stringify(user)}`);
      console.log(`Bonus Amount: ${amount}`);
      console.log(`New balance to be updated: ${newBalance}`);

      // Update user's balance
      pool.query('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId], (err) => {
          if (err) {
              console.error('Error updating user balance:', err);
              return res.status(500).json({ success: false, message: 'Server error' });
          }

          console.log(`User balance updated to: ${newBalance}`);

          // Log the bonus in the bonuses table
          pool.query('INSERT INTO bonuses (user_id, amount, type, reason) VALUES (?, ?, ?, ?)', [
              userId,
              amount,
              bonusType,
              reason
          ], (err) => {
              if (err) {
                  console.error('Error inserting bonus:', err);
                  return res.status(500).json({ success: false, message: 'Server error' });
              }

              // Send success response
              res.json({ success: true });
          });
      });
  });
});







// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Dynamic route to serve other HTML pages
app.get('/:page', (req, res) => {
    const page = req.params.page;
    res.sendFile(path.join(__dirname, `${page}.html`));
});

// Catch-all route for any unmatched routes
app.get('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Handle favicon requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();  // No Content
});



// Test the connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to the database:', err);
    } else {
        console.log('Connected to the database');
        connection.release();  // Release the connection back to the pool
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
