const jwt = require('jsonwebtoken');
console.log(jwt.sign({ axim_internal_admin: true }, 'secret'));
