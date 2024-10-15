const { Client, APIErrorCode } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DB_ID;

const filteredRows = async (req, res) => {
    console.log('HIT filteredRows: ', databaseId);
    
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format

    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            "filter": {
                "timestamp": "created_time",
                "created_time": {
                    "equals": today
                }
            },
        });
        res.status(200).json({ response });
    } catch (error) {
        if (error.code === APIErrorCode.ObjectNotFound) {
            res.status(404).json({ msg: 'Database not found.' });
        } else {
            res.status(400).json({ msg: 'Error getting information from notion.' });
            console.error(error);
        }
    }
};


module.exports = {
    filteredRows
}
