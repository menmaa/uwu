declare module "uwu" {
    interface PackOptions {
        maxPartSize?: number | undefined;
        outputNameFormat?: string | undefined;
        compress?: boolean | undefined;
    }
    
    /**
     * Packages the contents of a directory into one or multiple part files.
     * @param {string} srcDir The source directory.
     * @param {string} dstDir The destination directory.
     * @param {PackOptions} options `PackOptions` options.
     */
    function pack(srcDir: string, dstDir: string, options?: PackOptions) : Promise<void>;
}
