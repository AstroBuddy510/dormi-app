module.exports = (req, res) => {
  res.status(200).json({ 
    message: "Self-contained API is working",
    timestamp: new Date().toISOString()
  });
};
