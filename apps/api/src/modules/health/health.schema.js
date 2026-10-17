const { z } = require('zod');

const healthQuerySchema = z.object({}).strict();

module.exports = { healthQuerySchema };
