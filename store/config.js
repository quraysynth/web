/**
 * config.yml fields (via configData).
 */

function storeConfigMethods() {
    return {
        setConfigField(key, value) {
            this.configData[key] = value;
            this.markDirty('config');
        },
    };
}
