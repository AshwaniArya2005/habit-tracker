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

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    fetchHabits();
    setupEventListeners();
    setupChart();
});

// Setup event listeners
function setupEventListeners() {
    // Add habit form submission
    habitForm.addEventListener('submit', handleAddHabit);
    
    // Log form submission
    logForm.addEventListener('submit', handleLogHabit);
    
    // Toggle switch for completion status
    completedToggle.addEventListener('change', (e) => {
        toggleLabel.textContent = e.target.checked ? 'Yes' : 'No';
    });
    
    // Modal close buttons
    closeModal.addEventListener('click', () => modal.classList.remove('show'));
    cancelLog.addEventListener('click', () => modal.classList.remove('show'));
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}

// Fetch all habits from the server
async function fetchHabits() {
    try {
        const response = await fetch('/api/habits');
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
    
    const today = new Date().toISOString().split('T')[0];
    
    habitsContainer.innerHTML = habits.map(habit => {
        const completionStatus = habit.logs && habit.logs[today] ? 
            `<span class="badge ${habit.logs[today].completed ? 'completed' : 'missed'}">
                ${habit.logs[today].completed ? 'Completed' : 'Missed'}
            </span>` : 
            '<span class="badge pending">Pending</span>';
            
        return `
            <div class="habit-card" data-id="${habit.id}">
                <div class="habit-header">
                    <h3 class="habit-title">${habit.name}</h3>
                    <span class="habit-frequency">${formatFrequency(habit.frequency)}</span>
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
                    <button class="btn btn-primary log-habit" data-id="${habit.id}">
                        <i class="fas fa-plus"></i> Log Today
                    </button>
                    <button class="btn btn-secondary view-details" data-id="${habit.id}">
                        <i class="fas fa-chart-line"></i> Details
                    </button>
                </div>
                <div class="completion-status">
                    ${completionStatus}
                </div>
            </div>
        `;
    }).join('');
    
    // Add event listeners to the new buttons
    document.querySelectorAll('.log-habit').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const habitId = parseInt(button.dataset.id);
            openLogModal(habitId);
        });
    });
    
    document.querySelectorAll('.view-details').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const habitId = parseInt(button.dataset.id);
            // In a real app, this would navigate to a details page
            showNotification('Feature coming soon!', 'info');
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
    
    console.log('Submitting habit:', formData);
    
    if (!formData.name || !formData.goal) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        console.log('Sending request to /api/habits');
        const response = await fetch('/api/habits', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        console.log('Received response status:', response.status);
        
        let result;
        try {
            result = await response.json();
            console.log('Response data:', result);
        } catch (jsonError) {
            console.error('Failed to parse JSON response:', jsonError);
            throw new Error('Invalid response from server');
        }
        
        if (!response.ok) {
            console.error('Server error:', result);
            throw new Error(result.error || `Server responded with status ${response.status}`);
        }
        
        console.log('Habit added successfully:', result);
        
        // Reset form and refresh the list
        habitForm.reset();
        await fetchHabits();
        showNotification('Habit added successfully!', 'success');
    } catch (error) {
        console.error('Error adding habit:', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// Open the log modal for a specific habit
function openLogModal(habitId) {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    
    currentHabitId = habitId;
    document.getElementById('modal-title').textContent = `Log: ${habit.name}`;
    document.getElementById('habit-id').value = habitId;
    
    // Reset form
    completedToggle.checked = false;
    toggleLabel.textContent = 'No';
    document.getElementById('notes').value = '';
    
    // Show the modal
    modal.classList.add('show');
}

// Handle logging a habit
async function handleLogHabit(e) {
    e.preventDefault();
    
    const formData = {
        completed: completedToggle.checked,
        notes: document.getElementById('notes').value.trim()
    };
    
    try {
        const response = await fetch(`/api/habits/${currentHabitId}/log`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to log habit');
        }
        
        // Close modal and refresh the list
        modal.classList.remove('show');
        await fetchHabits();
        showNotification('Habit logged successfully!', 'success');
    } catch (error) {
        console.error('Error logging habit:', error);
        showNotification('Failed to log habit. Please try again.', 'error');
    }
}

// Update the stats section
function updateStats() {
    if (habits.length === 0) {
        document.getElementById('current-streak').textContent = '0 days';
        document.getElementById('habits-today').textContent = '0/0';
        document.getElementById('completion-rate').textContent = '0%';
        updateChart([], []);
        return;
    }
    
    // Calculate current streak (longest streak from all habits)
    const currentStreak = habits.reduce((max, habit) => 
        Math.max(max, habit.current_streak || 0), 0);
    
    // Calculate completion rate (average of all habits)
    const totalCompletion = habits.reduce((sum, habit) => 
        sum + (parseInt(habit.completion_rate) || 0), 0);
    const avgCompletion = Math.round(totalCompletion / habits.length);
    
    // Update the UI
    document.getElementById('current-streak').textContent = `${currentStreak} day${currentStreak !== 1 ? 's' : ''}`;
    document.getElementById('completion-rate').textContent = `${avgCompletion}%`;
    
    // Update the chart
    updateChart(
        habits.map(habit => habit.name),
        habits.map(habit => habit.completion_rate || 0)
    );
}

// Setup the chart
function setupChart() {
    const ctx = document.getElementById('progress-chart').getContext('2d');
    progressChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Completion Rate %',
                data: [],
                backgroundColor: 'rgba(74, 111, 165, 0.7)',
                borderColor: 'rgba(74, 111, 165, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Completion Rate (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Habits'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Update the chart with new data
function updateChart(labels, data) {
    if (!progressChart) return;
    
    progressChart.data.labels = labels;
    progressChart.data.datasets[0].data = data;
    progressChart.update();
}

// Helper function to format frequency
function formatFrequency(frequency) {
    const frequencyMap = {
        'daily': 'Daily',
        'weekly': 'Weekly',
        'weekdays': 'Weekdays',
        'weekends': 'Weekends'
    };
    
    return frequencyMap[frequency] || frequency;
}

// Show a notification
function showNotification(message, type = 'info') {
    // In a real app, you might use a more sophisticated notification system
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add some basic styles for notifications
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
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        transform: translateX(120%);
        transition: transform 0.3s ease-in-out;
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.fade-out {
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
    }
    
    .notification.success {
        background-color: #28a745;
    }
    
    .notification.error {
        background-color: #dc3545;
    }
    
    .notification.info {
        background-color: #17a2b8;
    }
`;

document.head.appendChild(notificationStyles);

// Initialize the app
function init() {
    // Show the first notification after a short delay
    setTimeout(() => {
        showNotification('Welcome to Habit Tracker! Start by adding your first habit.', 'info');
    }, 1000);
}

// Start the app
init();
