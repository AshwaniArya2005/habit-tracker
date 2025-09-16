const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Database setup
const dbPath = path.join(__dirname, 'habit-tracker.db');
console.log('Database path:', dbPath);

// Create database file if it doesn't exist
if (!fs.existsSync(dbPath)) {
    console.log('Creating new database file...');
    fs.writeFileSync(dbPath, '');
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        process.exit(1);
    } else {
        console.log('Successfully connected to SQLite database');
        
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
        
        // Create tables
        const createTables = `
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                frequency TEXT NOT NULL,
                goal TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS habit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                habit_id INTEGER,
                completed BOOLEAN DEFAULT 0,
                log_date DATE DEFAULT CURRENT_DATE,
                notes TEXT,
                FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
            );
        `;
        
        db.serialize(() => {
            db.exec(createTables, (err) => {
                if (err) {
                    console.error('Error creating tables:', err);
                    process.exit(1);
                } else {
                    console.log('Database tables created successfully');
                }
            });
        });
    }
});

// API Routes
app.get('/api/habits', (req, res) => {
    const query = `
        SELECT h.*, 
               (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id AND completed = 1) as current_streak,
               (SELECT COUNT(*) FROM habit_logs WHERE habit_id = h.id) as total_entries
        FROM habits h
        ORDER BY h.created_at DESC`;

    db.all(query, [], async (err, rows) => {
        if (err) {
            console.error('Error fetching habits:', err);
            return res.status(500).json({ error: 'Failed to fetch habits' });
        }

        // Helper to promisify db.all
        const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
            db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r)));
        });

        try {
            const habitsWithLogs = await Promise.all(rows.map(async (h) => {
                // Fetch recent logs (last 90 days) and build date->entry map
                const logs = await dbAll(
                    `SELECT completed, notes, date(log_date) as log_date
                     FROM habit_logs
                     WHERE habit_id = ?
                     ORDER BY date(log_date) ASC`,
                    [h.id]
                );
                const logsMap = {};
                let completedCount = 0;
                logs.forEach(l => {
                    logsMap[l.log_date] = { completed: !!l.completed, notes: l.notes || '' };
                    if (l.completed) completedCount++;
                });

                const totalEntries = h.total_entries || logs.length;
                const completionRate = totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

                return {
                    ...h,
                    logs: logsMap,
                    completion_rate: completionRate
                };
            }));

            res.json(habitsWithLogs);
        } catch (e) {
            console.error('Error enriching habits with logs:', e);
            res.status(500).json({ error: 'Failed to assemble habits data' });
        }
    });
});

app.post('/api/habits', (req, res) => {
    console.log('Received request to add habit:', req.body);
    const { name, frequency, goal } = req.body;
    
    if (!name || !frequency || !goal) {
        console.error('Missing required fields:', { name, frequency, goal });
        return res.status(400).json({ error: 'Name, frequency, and goal are required' });
    }
    
    db.run(
        'INSERT INTO habits (name, frequency, goal) VALUES (?, ?, ?)',
        [name, frequency, goal],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ 
                    error: 'Database error',
                    details: err.message 
                });
            }
            
            console.log('Habit added with ID:', this.lastID);
            
            res.status(201).json({
                id: this.lastID,
                name,
                frequency,
                goal,
                created_at: new Date().toISOString(),
                current_streak: 0,
                total_entries: 0
            });
        }
    );
});

// Delete a habit (and cascade deletes its logs via FK)
app.delete('/api/habits/:id', (req, res) => {
    const habitId = req.params.id;
    db.run('DELETE FROM habits WHERE id = ?', [habitId], function(err) {
        if (err) {
            console.error('Error deleting habit:', err);
            return res.status(500).json({ error: 'Failed to delete habit' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Habit not found' });
        }
        return res.status(204).send();
    });
});

app.put('/api/habits/:id/log', (req, res) => {
    const { completed, notes, date } = req.body;
    const habitId = req.params.id;

    // Allow client to specify log date; default to today
    const today = new Date().toISOString().split('T')[0];
    const logDate = date || today;

    db.get(
        'SELECT * FROM habit_logs WHERE habit_id = ? AND date(log_date) = ?',
        [habitId, logDate],
        (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            const logData = [completed, notes, habitId, logDate];
            
            if (row) {
                // Update existing log
                db.run(
                    'UPDATE habit_logs SET completed = ?, notes = ? WHERE habit_id = ? AND date(log_date) = ?',
                    logData,
                    function(err) {
                        if (err) {
                            console.error('Error updating log:', err);
                            return res.status(500).json({ error: 'Failed to update habit log' });
                        }
                        res.json({ message: 'Habit log updated successfully' });
                    }
                );
            } else {
                // Create new log
                db.run(
                    'INSERT INTO habit_logs (completed, notes, habit_id, log_date) VALUES (?, ?, ?, ?)',
                    [...logData],
                    function(err) {
                        if (err) {
                            console.error('Error creating log:', err);
                            return res.status(500).json({ error: 'Failed to log habit' });
                        }
                        res.status(201).json({ message: 'Habit logged successfully' });
                    }
                );
            }
        }
    );
});

// Serve index.html only for non-API routes
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Start the server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server closed');
        db.close((err) => {
            if (err) {
                console.error('Error closing database connection:', err.message);
            } else {
                console.log('Database connection closed.');
            }
            process.exit(0);
        });
    });
});
