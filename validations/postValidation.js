const Joi = require('joi');

const createPostSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  type: Joi.string().valid('video', 'image').required(),
  url: Joi.string().uri().required(),
  account: Joi.string().hex().length(24).required(),
  status: Joi.string().valid('pending', 'posted').optional(),
});

const updatePostSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  type: Joi.string().valid('video', 'image').required(),
  url: Joi.string().uri().required(),
  account: Joi.string().hex().length(24).required(),
  status: Joi.string().valid('pending', 'posted').required(),
});

module.exports = { createPostSchema, updatePostSchema };
