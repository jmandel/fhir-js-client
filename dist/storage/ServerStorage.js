class ServerStorage {
  constructor(request) {
    this.request = request;
  }

  async get(key) {
    return this.request.session[key];
  }

  async set(key, value) {
    this.request.session[key] = value;
    return value;
  }

  async unset(key) {
    if (this.request.session.hasOwnProperty(key)) {
      delete this.request.session[key];
      return true;
    }

    return false;
  }

}

module.exports = ServerStorage;