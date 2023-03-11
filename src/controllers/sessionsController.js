const mongoose = require("mongoose");
const Users = require("../models/Users");

mongoose.set("useFindAndModify", false);

module.exports = {
	isLoged(req, res) {
		// momento bruh
		res.sendStatus(req.session.userId !== null ? 200 : 401);
	},

	isAdmin(req, res) {
		res.sendStatus(req.session.isAdmin ? 200 : 403);
	},

	async login(req, res) {
		const { email, password, gsuite } = req.body;

		// findOne nao vai retornar nada pq deram a merda de hash ao email fds
		const user = await Users.findOne({ email });

		if (!email) {
			return res.status(400).json({
				ok: false,
				msg: "Email não especificado!",
			});
		}

		// if login pelo google
		if (!gsuite && !password) {
			return res.status(400).json({
				ok: false,
				msg: "Palavra-passe não especificada!",
			});
		}

		if (!user) {
			return res.status(404).json({
				code: 404,
				success: false,
				message: "There is no user with that email",
			});
		}

		if (!user.isVirtual && (gsuite || user.validatePassword(password))) {
			req.session.userId = user._id;
			req.session.isAdmin = user.isAdmin;
			// ver se e preciso a cena de ser virtual cheira me que nao
			req.session.isVirtual = user.isVirtual;

			return res.status(200).json({
				ok: true,
				name: user.name,
				_id: user._id,
				isAdmin: user.isAdmin,
			});
		}

		return res.status(401).json({
			ok: false,
			msg: "Credenciais incorretas!",
		});
	},

	async logout(req, res) {
		try {
			await req.session.destroy();
			res.clearCookie("JuninvSession");
			return res.status(200).json({ ok: true });
		} catch (err) {
			return res.status(500).json({ ok: false });
		}
	},
};
