const express = require('express');
const app = express();
app.use(express.json());

// API Endpoint for Industry, Innovation, and Infrastructure (SDG 9)
app.get('/api/infrastructure/status', (req, res) => {
  res.json({
    success: true,
    data: {
      initiative: "SDG 9: Industry, Innovation and Infrastructure",
      company: "FlashGrocer",
      metrics: {
        automatedWarehouses: 12,
        evFleetPercentage: 45.5,
        aiRoutingEfficiency: "98.2%",
        renewableEnergyUsage: "60%"
      },
      status: "Operational",
      reliabilityScore: 99.99
    },
    message: "Infrastructure metrics retrieved successfully."
  });
});

app.post('/api/infrastructure/innovation', (req, res) => {
  const { project, investment } = req.body;
  if (!project || !investment) {
    return res.status(400).json({ success: false, error: "Missing required fields: project or investment" });
  }
  res.status(201).json({
    success: true,
    data: {
      projectId: "INV-" + Math.floor(Math.random() * 10000),
      project,
      investment,
      expectedImpact: "High",
      reliabilityStatus: "Passed preliminary checks"
    },
    message: "Innovation project registered successfully."
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Mock API Server running on port ${PORT}`);
});
