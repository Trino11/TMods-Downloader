// Sends axios requests through the main process (window.tmods.http) instead of the
// page's own network stack, which CORS would stop for hosts like the bundle CDN. Services
// keep calling axios as usual; index.js installs this as axios's adapter.
import { AxiosError, AxiosHeaders } from 'axios';

export function bridgeAdapter(axios, http) {
    return async config => {
        let response;
        try {
            response = await http({
                method: (config.method || 'get').toUpperCase(),
                url: axios.getUri(config),
                headers: AxiosHeaders.from(config.headers).toJSON(),
                data: config.data,
                responseType: config.responseType,
            });
        } catch (error) {
            throw new AxiosError(error.message, AxiosError.ERR_NETWORK, config);
        }

        const result = {
            data: response.data,
            status: response.status,
            statusText: response.statusText,
            headers: AxiosHeaders.from(response.headers),
            config,
            request: {},
        };
        if (!config.validateStatus || config.validateStatus(result.status)) {
            return result;
        }
        throw new AxiosError(
            `Request failed with status code ${result.status}`,
            result.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
            config,
            result.request,
            result,
        );
    };
}
