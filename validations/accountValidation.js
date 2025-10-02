const Joi = require('joi');

const createAccountSchema = Joi.object({
  username: Joi.string().trim().min(3).required(),
  ig_user_id: Joi.string().trim().allow('', null),
  access_token: Joi.string().trim().allow('', null),
  email: Joi.string().trim().email().allow('', null),
});

const updateAccountSchema = Joi.object({
  username: Joi.string().trim().min(3).required(),
  ig_user_id: Joi.string().trim().allow('', null),
  access_token: Joi.string().trim().allow('', null),
  email: Joi.string().trim().email().allow('', null),
});

module.exports = { createAccountSchema, updateAccountSchema };
