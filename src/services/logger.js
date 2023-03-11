const { google } = require("googleapis");
const sheets = google.sheets("v4");

async function main() {
	const authClient = await authorize();
	const request = {
		// The ID of the spreadsheet to update.
		spreadsheetId: "185vMGZvlYZ7qQhtt7eVGnEgxWAP8QQPXikSg0hz6-3o",

		// The A1 notation of a range to search for a logical table of data.
		// Values are appended after the last row of the table.
		range: "my-range",

		// How the input data should be interpreted.
		valueInputOption: "",

		// How the input data should be inserted.
		insertDataOption: "",

		resource: {
			// TODO: Add desired properties to the request body.
		},

		auth: authClient,
	};

	try {
		const response = (await sheets.spreadsheets.values.append(request)).data;
		

	} catch (err) {
		console.error(err);
	}
}
main();

async function authorize() {
	let authClient = null;

	if (authClient == null) {
		throw Error("authentication failed");
	}

	return authClient;
}
