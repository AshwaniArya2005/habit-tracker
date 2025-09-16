// DOM Elements
const habitForm = document.getElementById('habit-form');
const habitsContainer = document.getElementById('habits-container');
const modal = document.getElementById('habit-modal');
const closeModal = document.querySelector('.close-modal');
const logForm = document.getElementById('log-form');
const cancelLog = document.getElementById('cancel-log');
const completedToggle = document.getElementById('completed');
const toggleLabel = document.getElementById('toggle-label');

// State
let habits = [];
let currentHabitId = null;
let progressChart = null;
let selectedDate = null; // YYYY-MM-DD used for testing UI state
let detailsChart = null; // chart instance for details modal

// API base URL (use absolute URL to avoid dev-server/static-server mismatches)
const API_BASE = window.API_BASE || 'http://localhost:3000';

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize selectedDate to today and set the test date control default if present
    const todayStr = new Date().toISOString().split('T')[0];
    selectedDate = todayStr;
    const testDateInput = document.getElementById('test-date');
    if (testDateInput) {
        testDateInput.value = todayStr;
    }

    setupChart();       // Setup chart first to avoid race condition
    fetchHabits();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    habitForm.addEventListener('submit', handleAddHabit);
    logForm.addEventListener('submit', handleLogHabit);

    completedToggle.addEventListener('change', (e) => {
        toggleLabel.textContent = e.target.checked ? 'Yes' : 'No';
    });

    closeModal.addEventListener('click', () => modal.classList.remove('show'));
    cancelLog.addEventListener('click', () => modal.classList.remove('show'));

    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
        const detailsModal = document.getElementById('habit-details-modal');
        if (e.target === detailsModal) detailsModal.classList.remove('show');
    });

    // Close details modal button
    const closeDetails = document.querySelector('.close-details-modal');
    if (closeDetails) {
        closeDetails.addEventListener('click', () => {
            const detailsModal = document.getElementById('habit-details-modal');
            if (detailsModal) detailsModal.classList.remove('show');
        });
    }

    // Test date controls for UI testing
    const testDateInput = document.getElementById('test-date');
    const resetDateBtn = document.getElementById('reset-date');
    if (testDateInput) {
        testDateInput.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                selectedDate = val;
            } else {
                selectedDate = new Date().toISOString().split('T')[0];
            }
            renderHabits();
            updateStats();
        });
    }
    if (resetDateBtn) {
        resetDateBtn.addEventListener('click', () => {
            const todayStr = new Date().toISOString().split('T')[0];
            selectedDate = todayStr;
            const input = document.getElementById('test-date');
            if (input) input.value = todayStr;
            renderHabits();
            updateStats();
        });
    }
}

// Delete a habit
async function handleDeleteHabit(habitId) {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    const confirmed = confirm(`Delete habit "${habit.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/api/habits/${habitId}`, { method: 'DELETE' });
        if (!response.ok) {
            const raw = await response.text();
            try {
                const err = JSON.parse(raw);
                throw new Error(err.error || err.message || `HTTP ${response.status}`);
            } catch (_) {
                throw new Error(raw.slice(0, 200));
            }
        }
        // Update local state
        habits = habits.filter(h => h.id !== habitId);
        renderHabits();
        updateStats();
        showNotification('Habit deleted.', 'success');
    } catch (error) {
        console.error('Error deleting habit:', error);
        showNotification(error.message || 'Failed to delete habit', 'error');
    }
}

// Open Details modal and populate content
function openDetailsModal(habitId) {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    const detailsModal = document.getElementById('habit-details-modal');
    const titleEl = document.getElementById('details-title');
    const streakEl = document.getElementById('details-streak');
    const completionEl = document.getElementById('details-completion');
    const totalEl = document.getElementById('details-total');
    const logsList = document.getElementById('details-logs');

    titleEl.textContent = `Habit Details: ${habit.name}`;
    streakEl.textContent = habit.current_streak || 0;
    completionEl.textContent = `${habit.completion_rate || 0}%`;
    totalEl.textContent = habit.total_entries || 0;

    // Populate recent logs (latest 14 days)
    const logs = habit.logs || {}; // { 'YYYY-MM-DD': { completed, notes } }
    const dates = Object.keys(logs).sort().slice(-14).reverse();
    logsList.innerHTML = dates.length === 0
        ? '<li>No logs yet.</li>'
        : dates.map(d => {
            const entry = logs[d];
            const status = entry.completed ? '✅ Completed' : '❌ Missed';
            const note = entry.notes ? ` — ${entry.notes}` : '';
            return `<li><strong>${d}:</strong> ${status}${note}</li>`;
        }).join('');

    // Mini chart for last 14 days (1/0)
    const allDates = getLastNDates(14);
    const chartLabels = allDates;
    const chartData = allDates.map(d => (logs[d] ? (logs[d].completed ? 1 : 0) : 0));

    const canvas = document.getElementById('details-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (detailsChart) {
        detailsChart.destroy();
    }
    detailsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Completed (1 = yes, 0 = no) — last 14 days',
                data: chartData,
                backgroundColor: 'rgba(99, 197, 132, 0.7)',
                borderColor: 'rgba(99, 197, 132, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 1, ticks: { stepSize: 1 } },
                x: { ticks: { autoSkip: true, maxTicksLimit: 7 } }
            },
            plugins: { legend: { display: false } }
        }
    });

    detailsModal.classList.add('show');
}

function getLastNDates(n) {
    const res = [];
    const today = new Date(selectedDate || new Date().toISOString().split('T')[0]);
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        res.push(d.toISOString().split('T')[0]);
    }
    return res;
}

// Fetch all habits from the server
async function fetchHabits() {
    try {
        const response = await fetch(`${API_BASE}/api/habits`);
        const contentType = response.headers.get('content-type') || '';

        if (!response.ok) {
            // Try to extract JSON error, otherwise text
            const raw = await response.text();
            try {
                const errJson = JSON.parse(raw);
                throw new Error(errJson.error || errJson.message || `HTTP ${response.status}`);
            } catch (_) {
                throw new Error(raw.slice(0, 200));
            }
        }

        if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`Expected JSON but received: ${text.slice(0, 120)}`);
        }

        habits = await response.json();
        renderHabits();
        updateStats();
    } catch (error) {
        console.error('Error fetching habits:', error);
        showNotification('Failed to load habits. Please try again.', 'error');
    }
}

// Render all habits
function renderHabits() {
    if (habits.length === 0) {
        habitsContainer.innerHTML = `
            <div class="no-habits">
                <i class="fas fa-clipboard-list"></i>
                <p>No habits added yet. Start by adding your first habit!</p>
            </div>
        `;
        return;
    }

    habitsContainer.innerHTML = habits.map(habit => {
        const logForDay = habit.logs && habit.logs[selectedDate];
        const isCompleted = logForDay ? !!logForDay.completed : null;
        const statusLabel = isCompleted === true ? 'Completed' : (isCompleted === false ? 'Missed' : 'Pending');
        const statusClass = isCompleted === true ? 'status-completed' : (isCompleted === false ? 'status-missed' : 'status-pending');

        return `
            <div class="habit-card" data-id="${habit.id}">
                <div class="habit-header">
                    <h3 class="habit-title">${habit.name}</h3>
                    <div>
                        <span class="habit-frequency">${formatFrequency(habit.frequency)}</span>
                        <span class="habit-status ${statusClass}">${statusLabel}</span>
                    </div>
                </div>
                <p class="habit-goal">Goal: ${habit.goal}</p>
                <div class="habit-stats">
                    <div class="stat">
                        <div class="stat-value">${habit.current_streak || 0}</div>
                        <div class="stat-label">Day Streak</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${habit.completion_rate || 0}%</div>
                        <div class="stat-label">Completion</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${habit.total_entries || 0}</div>
                        <div class="stat-label">Total</div>
                    </div>
                </div>
                <div class="habit-actions">
                    <button class="btn btn-primary btn-sm log-habit" data-id="${habit.id}">
                        <i class="fas fa-plus"></i> Log Today
                    </button>
                    <button class="btn btn-secondary btn-sm view-details" data-id="${habit.id}">
                        <i class="fas fa-chart-line"></i> Details
                    </button>
                    <button class="btn btn-danger btn-sm delete-habit" data-id="${habit.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.log-habit').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            openLogModal(parseInt(button.dataset.id));
        });
    });

    document.querySelectorAll('.view-details').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            openDetailsModal(parseInt(button.dataset.id));
        });
    });

    document.querySelectorAll('.delete-habit').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(button.dataset.id);
            await handleDeleteHabit(id);
        });
    });
}

// Handle adding a new habit
async function handleAddHabit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('habit-name').value.trim(),
        frequency: document.getElementById('frequency').value,
        goal: document.getElementById('goal').value.trim()
    };

    if (!formData.name || !formData.goal) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/habits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            const raw = await response.text();
            try {
                const errJson = JSON.parse(raw);
                throw new Error(errJson.error || errJson.message || `HTTP ${response.status}`);
            } catch (_) {
                throw new Error(raw.slice(0, 200));
            }
        }
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`Expected JSON but received: ${text.slice(0, 120)}`);
        }

        const newHabit = await response.json();
        habitForm.reset();
        habits = [newHabit, ...habits];
        renderHabits();
        updateStats();

        showNotification('Habit added successfully!', 'success');
    } catch (error) {
        console.error('Error adding habit:', error);
        showNotification(error.message || 'Failed to add habit', 'error');
    }
}

// Open the log modal
function openLogModal(habitId) {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    currentHabitId = habitId;
    document.getElementById('modal-title').textContent = `Log: ${habit.name}`;
    document.getElementById('habit-id').value = habitId;

    completedToggle.checked = false;
    toggleLabel.textContent = 'No';
    document.getElementById('notes').value = '';

    modal.classList.add('show');
}

// Handle logging a habit
async function handleLogHabit(e) {
    e.preventDefault();

    const formData = {
        completed: completedToggle.checked,
        notes: document.getElementById('notes').value.trim(),
        date: selectedDate
    };

    try {
        const response = await fetch(`${API_BASE}/api/habits/${currentHabitId}/log`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            const raw = await response.text();
            try {
                const errJson = JSON.parse(raw);
                throw new Error(errJson.message || errJson.error || `HTTP ${response.status}`);
            } catch (_) {
                throw new Error(raw.slice(0, 200));
            }
        }
        if (!contentType.includes('application/json')) {
            // Some endpoints may return only a message; still handle text gracefully
            // But our server returns JSON; surface a helpful error if not
            const text = await response.text();
            // Allow simple success message text as OK fallback
            if (text && text.toLowerCase().includes('success')) {
                // proceed as success
            } else {
                throw new Error(`Expected JSON but received: ${text.slice(0, 120)}`);
            }
        }

        modal.classList.remove('show');
        await fetchHabits();
        showNotification('Habit logged successfully!', 'success');
    } catch (error) {
        console.error('Error logging habit:', error);
        showNotification(error.message || 'Failed to log habit', 'error');
    }
}

// Update stats
function updateStats() {
    if (habits.length === 0) {
        document.getElementById('current-streak').textContent = '0 days';
        document.getElementById('habits-today').textContent = '0/0';
        document.getElementById('completion-rate').textContent = '0%';
        updateChart([], []);
        return;
    }

    const completedToday = habits.filter(h => h.logs && h.logs[selectedDate] && h.logs[selectedDate].completed).length;

    const currentStreak = habits.reduce((max, habit) =>
        Math.max(max, habit.current_streak || 0), 0);

    const totalCompletion = habits.reduce((sum, habit) =>
        sum + (parseInt(habit.completion_rate) || 0), 0);
    const avgCompletion = Math.round(totalCompletion / habits.length);

    document.getElementById('current-streak').textContent = `${currentStreak} day${currentStreak !== 1 ? 's' : ''}`;
    document.getElementById('completion-rate').textContent = `${avgCompletion}%`;
    document.getElementById('habits-today').textContent = `${completedToday}/${habits.length}`;

    updateChart(
        habits.map(habit => habit.name),
        habits.map(habit => habit.completion_rate || 0)
    );
}

// Chart setup
function setupChart() {
    const ctx = document.getElementById('progress-chart').getContext('2d');
    progressChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Completion Rate %', data: [], backgroundColor: 'rgba(74,111,165,0.7)', borderColor: 'rgba(74,111,165,1)', borderWidth: 1 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, title: { display: true, text: 'Completion Rate (%)' } },
                x: { title: { display: true, text: 'Habits' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// Update chart
function updateChart(labels, data) {
    if (!progressChart) return;
    progressChart.data.labels = labels;
    progressChart.data.datasets[0].data = data;
    progressChart.update();
}

// Format frequency
function formatFrequency(frequency) {
    const frequencyMap = { 'daily': 'Daily', 'weekly': 'Weekly', 'weekdays': 'Weekdays', 'weekends': 'Weekends' };
    return frequencyMap[frequency] || frequency;
}

// Notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Trigger slide-in
    requestAnimationFrame(() => notification.classList.add('show'));

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 5px;
        color: white;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        transform: translateX(120%);
        transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
    }
    .notification.show { transform: translateX(0); }
    .notification.fade-out { opacity: 0; }
    .notification.success { background-color: #28a745; }
    .notification.error { background-color: #dc3545; }
    .notification.info { background-color: #17a2b8; }
`;
document.head.appendChild(notificationStyles);

// Init
function init() {
    setTimeout(() => {
        showNotification('Welcome to Habit Tracker! Start by adding your first habit.', 'info');
    }, 1000);
}
init();
