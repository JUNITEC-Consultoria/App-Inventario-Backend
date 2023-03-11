const mongoose = require("mongoose");
var Promise = require("bluebird");
const { IncomingForm } = require("formidable");
const xlsx = require("node-xlsx");
const fs = require("fs");
const ExcelJS = require("exceljs");

const excelmimetypes = [
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.template",
	"application/vnd.ms-excel.sheet.macroEnabled.12",
	"application/vnd.ms-excel.template.macroEnabled.12",
	"application/vnd.ms-excel.addin.macroEnabled.12",
	"application/vnd.ms-excel.sheet.binary.macroEnabled.12",
	"application/vnd.oasis.opendocument.spreadsheet",
];

//input name for excel file must be "excel"
const input_name = "excel";

// not working??
const FORM_OPTIONS = {
	filter({ name, originalFilename, mimetype }) {
		return name && name === "excel" && mimetype && mimetype.includes("excel");
	},
};

module.exports = {
	fetchWorkbook(req, res, next) {
		const form = new IncomingForm(FORM_OPTIONS);

		form.onPart = function (part) {
			if (part.name && part.name === input_name) {
				if (part.filename && excelmimetypes.indexOf(part.mime) > -1) form.handlePart(part);
				else res.status(500).send("Algo correu mal. Por favor volte a tentar mais tarde...");
			}
		};

		form.parse(req, function (err, fields, files) {
			if (err) res.status(500).send("Algo correu mal. Por favor volte a tentar mais tarde...");
			else if (files && input_name in files) {
				// retorna uma lista sei la pq
				req.workbook = xlsx.parse(files[input_name].path)[0];

				return next();
			} else if (!res.headersSent) res.status(500).send("Algo correu mal. Por favor volte a tentar mais tarde...");
		});
	},

	f() {
		return new Promise((resolve, reject) => resolve());
	},

	// isto so comeca uma transacao literalmente
	async importFromWorkbook(req, res, cb) {
		try {
			const session = await mongoose.connection.startSession();
			session.startTransaction();

			try {
				await cb(req.workbook);

				await session.commitTransaction();

				res.sendStatus(200);
			} catch (err) {
				await session.abortTransaction();

				res.status(500).send(
					err.code === "file"
						? err.message
						: "(GERAL) Ocorreu um erro durante o processamento dos dados. Por favor, tente novamente dentro de instantes..."
				);
			} finally {
				session.endSession();
			}
		} catch (err) {
			res.status(500).send("Algo correu mal. Por favor volte a tentar mais tarde...");
		}
	},

	createWorkbook: function (req, res, next) {
		try {
			const workbook = new ExcelJS.Workbook();

			workbook.creator = "JUNITEC";
			workbook.lastModifiedBy = "JUNITEC";
			workbook.created = new Date();
			workbook.properties.date1904 = true;
			workbook.calcProperties.fullCalcOnLoad = true;
			workbook.useStyles = true;
			workbook.views = [
				{
					x: 0,
					y: 0,
					width: 10000,
					height: 20000,
					firstSheet: 0,
					activeTab: 1,
					visibility: "visible",
				},
			];

			req.workbook = workbook;
			req.workbook.addWorksheet("Main Sheet");
			next();
		} catch {
			res.sendStatus(500);
		}
	},

	async exportAsWorkbook(req, res, cb) {
		Promise.all(
			req.workbook.worksheets.map(async (sheet) => {
				return await cb(sheet);
			})
		)
			.then(() => {
				req.workbook.worksheets.map((sheet) => {
					let i = 0;

					sheet.eachRow({ includeEmpty: true }, function (row, rowNumber) {
						if (rowNumber == 1) {
							row.height = 25;

							row.eachCell(function (cell) {
								cell.font = {
									name: "Arial",
									family: 2,
									bold: true,
									size: 14,
									color: { argb: "FFFFFF" },
								};
								cell.alignment = {
									vertical: "middle",
									horizontal: "center",
								};
								cell.fill = {
									type: "pattern",
									pattern: "solid",
									fgColor: { argb: "3465a4" },
								};
								cell.border = {
									top: { style: "thin" },
									left: { style: "thin" },
									bottom: { style: "thin" },
									right: { style: "thin" },
								};
							});
						} else {
							row.height = 20;

							row.eachCell(function (cell) {
								cell.font = {
									name: "Arial",
									family: 2,
									bold: false,
									size: 12,
								};
								cell.alignment = {
									vertical: "middle",
									horizontal: "center",
								};
								cell.fill = {
									type: "pattern",
									pattern: "solid",
									fgColor: { argb: i % 2 == 0 ? "dae5f2" : "f3f3f3" },
								};
								cell.border = {
									top: { style: "thin" },
									left: { style: "thin" },
									bottom: { style: "thin" },
									right: { style: "thin" },
								};
							});

							i++;
						}
					});
				});
			})
			.then(async () => {
				let filename = `${req.query.title}.xlsx`;
				let path = `./reports/${filename}`;
				await req.workbook.xlsx.writeFile(path);

				let file = fs.createReadStream(path);
				file.on("end", function () {
					fs.unlink(path, function () {});
				});
				file.pipe(res);
			})
			.catch(() => {
				res.sendStatus(500);
			});
	},
};
