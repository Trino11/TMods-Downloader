import { describeVersionId, parseLoaderId } from '../loaderIds';

describe('parseLoaderId', () => {
    it('reads Fabric and Quilt ids, snapshots included', () => {
        expect(parseLoaderId('fabric-loader-0.16.5-1.21.1')).toEqual({
            loader: 'fabric',
            loaderVersion: '0.16.5',
            gameVersion: '1.21.1',
        });
        expect(parseLoaderId('quilt-loader-0.26.4-1.21-pre1')).toEqual({
            loader: 'quilt',
            loaderVersion: '0.26.4',
            gameVersion: '1.21-pre1',
        });
    });

    it('reads Forge ids, old and new', () => {
        expect(parseLoaderId('1.20.1-forge-47.2.0')).toEqual({
            loader: 'forge',
            loaderVersion: '47.2.0',
            gameVersion: '1.20.1',
        });
        expect(parseLoaderId('1.12.2-forge1.12.2-14.23.5.2859')).toEqual({
            loader: 'forge',
            loaderVersion: '14.23.5.2859',
            gameVersion: '1.12.2',
        });
    });

    it('works out the Minecraft version from NeoForge build numbers', () => {
        expect(parseLoaderId('neoforge-21.1.77').gameVersion).toBe('1.21.1');
        expect(parseLoaderId('neoforge-21.0.167').gameVersion).toBe('1.21');
        expect(parseLoaderId('neoforge-26.1.0.5-beta').gameVersion).toBe('26.1');
        expect(parseLoaderId('neoforge-weird').gameVersion).toBeNull();
    });

    it('returns null for vanilla and unknown ids', () => {
        expect(parseLoaderId('1.21.1')).toBeNull();
        expect(parseLoaderId('OptiFine_1.20.1_HD_U_I6')).toBeNull();
        expect(parseLoaderId('')).toBeNull();
        expect(parseLoaderId(undefined)).toBeNull();
    });
});

it('describes loader versions in plain words and leaves others alone', () => {
    expect(describeVersionId('fabric-loader-0.16.5-1.21.1')).toBe('Minecraft 1.21.1 · Fabric 0.16.5');
    expect(describeVersionId('1.20.1-forge-47.2.0')).toBe('Minecraft 1.20.1 · Forge 47.2.0');
    expect(describeVersionId('neoforge-weird')).toBe('NeoForge weird');
    expect(describeVersionId('1.21.1')).toBe('1.21.1');
});
