const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');

const app = express();

// Middleware
app.use(cors());            // Allow cross-origin requests
app.use(morgan('dev'));      // Log requests to the console
app.use(express.json());     // Parse incoming JSON requests

// Routes
app.use('/api', routes);     // Set up main API route

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

