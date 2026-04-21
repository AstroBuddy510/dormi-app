module.exports = (req, res) => {
  res.status(200).json({ 
    message: "API Entry Point is Alive",
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL
    }
  });
};
