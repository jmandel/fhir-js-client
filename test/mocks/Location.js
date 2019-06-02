function Location(url)
{
    return {
        href: url,

        toString() {
            return url;
        }
    };
}

module.exports = Location;