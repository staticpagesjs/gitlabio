import Got from 'got';
// @ts-ignore
import { decamelizeKeys } from 'xcase';
import delay from 'delay';
import {
	DefaultResourceOptions,
	DefaultRequestReturn,
	DefaultRequestOptions,
	createRequesterFn,
	defaultOptionsHandler as baseOptionsHandler,
} from '@gitbeaker/requester-utils';

export function defaultOptionsHandler(
	resourceOptions: DefaultResourceOptions,
	{ body, query, sudo, method }: DefaultRequestOptions = {},
): DefaultRequestReturn & {
	json?: Record<string, unknown>;
	https?: { rejectUnauthorized: boolean; };
} {
	const options: DefaultRequestReturn & {
		json?: Record<string, unknown>;
		https?: { rejectUnauthorized: boolean; };
	} = baseOptionsHandler(resourceOptions, { body, query, sudo, method });

	// FIXME: Not the best comparison, but...it will have to do for now.
	if (typeof body === 'object' && body.constructor.name !== 'FormData') {
		options.json = decamelizeKeys(body);

		delete options.body;
	}

	if (
		resourceOptions.url.includes('https') &&
		resourceOptions.rejectUnauthorized != null &&
		resourceOptions.rejectUnauthorized === false
	) {
		options.https = {
			rejectUnauthorized: resourceOptions.rejectUnauthorized,
		};
	}

	return options;
}

export function processBody({
	rawBody,
	headers,
}: {
	rawBody: Buffer;
	headers: Record<string, unknown>;
}) {
	// Split to remove potential charset info from the content type
	const contentType = ((headers['content-type'] as string) || '').split(';')[0].trim();

	if (contentType === 'application/json') {
		return rawBody.length === 0 ? {} : JSON.parse(rawBody.toString());
	}

	if (contentType.startsWith('text/')) {
		return rawBody.toString();
	}

	return Buffer.from(rawBody);
}

export async function handler(endpoint: string, options: Record<string, unknown>) {
	const retryCodes = [429, 502];
	const maxRetries = 10;
	let response;

	for (let i = 0; i < maxRetries; i += 1) {
		const waitTime = 2 ** i * 0.1;
		try {
			if (options.method === 'stream') {
				return Got(endpoint, { ...options, method: 'get', isStream: true });
			}

			response = await Got(endpoint, options);
			break;
		} catch (e: any) {
			if (e.response) {
				if (retryCodes.includes(e.response.statusCode)) {
					await delay(waitTime);
					continue;
				}

				if (typeof e.response.body === 'string' && e.response.body.length > 0) {
					try {
						const output = JSON.parse(e.response.body);
						e.description = output.error || output.message;
					} catch (err) {
						e.description = e.response.body;
					}
				}
			}

			throw e;
		}
	}

	// MODIFIED: Changed how we return the response.
	return {
		body: response?.rawBody ?? Buffer.from([]),
		headers: response?.headers ?? {},
		status: response?.statusCode ?? 500
	};
}

export const requesterFn = createRequesterFn(defaultOptionsHandler, handler as any);
