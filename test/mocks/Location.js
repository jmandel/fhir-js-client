export default function Location(url)
{
    return {
        href: url,

        toString() {
            return url;
        }
    };
}
