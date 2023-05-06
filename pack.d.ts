export interface PackOptions {
    maxPartSize?: number | undefined;
    outputNameFormat?: string | undefined;
}

/**
 * Packages the contents of a directory into one or multiple equal size part files.
 * @param {string} srcDir The source directory.
 * @param {string} dstDir The destination directory.
 * @param {PackOptions} options `PackOptions` options.
 */
export default function pack(srcDir: string, dstDir: string, options?: PackOptions) : Promise<undefined>;