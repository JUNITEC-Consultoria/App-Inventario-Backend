const mongoose = require("mongoose");

const LocationsSchema = new mongoose.Schema({
	value: { type: String, required: true },
	parentId: { type: mongoose.ObjectId },
});

module.exports = mongoose.model("Location", LocationsSchema);
