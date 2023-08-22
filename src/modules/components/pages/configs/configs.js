import React, { useState } from 'react';
import axios from 'axios';
import Downloadspinner from '../../utils/Downloadspinner';

const fs = window.require('fs');
const os = window.require('os');
const path = window.require('path');
const AdmZip = window.require('adm-zip');

const dotminecraft = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
const tmodDirectory = `${dotminecraft}\\.tmods_loader`;
const tmodDirectoryConfigs = `${tmodDirectory}\\configs`;
const configsDowloadedFileInfo = `${tmodDirectoryConfigs}\\downloaded.txt`;

function Configs() {
    const [downloading, setDownloading] = useState(false);
    const [configs, setConfigs] = useState({});

    function readAndCreateTmodFolder() {
        if (!fs.existsSync(tmodDirectory)) {
            fs.mkdirSync(tmodDirectory);
        }
        if (!fs.existsSync(tmodDirectoryConfigs)) {
            fs.mkdirSync(tmodDirectoryConfigs);
        }
        if (!fs.existsSync(configsDowloadedFileInfo)) {
            fs.writeFileSync(configsDowloadedFileInfo, '', 'utf-8');
        }
    }
    readAndCreateTmodFolder();
    
    function copyDir(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }

        const items = fs.readdirSync(src);

        for (let item of items) {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);

            const stats = fs.statSync(srcPath);

            // If directory, recursively copy, else copy the file
            if (stats.isDirectory()) {
                copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    const downloaded = fs.readFileSync(configsDowloadedFileInfo, 'utf-8');

    function handleUpdateClick() {
        axios.get(window.tmodsconfig.MANIFEST_URL)
            .then(response => {
                setConfigs({ latest: response.data.latest.configs, versions: response.data.versions.configs });
            })
            .catch(error => {
                console.error("There was an error fetching the data:", error);
            });
    }

    function handleDownloadClick(item) {
        setDownloading(true);
        if (!fs.existsSync(tmodDirectoryConfigs)) {
            fs.mkdirSync(tmodDirectoryConfigs);
        };
        axios({
            method: 'get',
            url: item.url,
            responseType: 'blob'
        }).then(response => {
            const blob = new Blob([response.data], { type: response.headers['content-type'] });
            const reader = new FileReader();

            reader.onload = function () {
                const buffer = Buffer.from(this.result);
                const modFile = tmodDirectoryConfigs + '/configs.zip';
                fs.writeFile(modFile, buffer, (err) => {
                    if (err) {
                        setDownloading(false);
                        console.error("Error saving the file:", err);
                    } else {
                        // const dotminecraftresourcepacks = dotminecraft + '\\resourcepacks';
                        
                        const dotminecraftconfig = dotminecraft + '\\config';
                        const dotminecraftconfig_back = dotminecraftconfig + '_back';
                        if (fs.existsSync(dotminecraftconfig)) {
                            // If it exists, check if backup directory already exists, if it does, remove it first
                            if (fs.existsSync(dotminecraftconfig_back)) {
                                fs.rmdirSync(dotminecraftconfig_back, { recursive: true, force: true }); // Using recursive and force to ensure deep deletion
                            }

                            copyDir(dotminecraftconfig, dotminecraftconfig_back)
                        }

                        const zip = new AdmZip(modFile);
                        zip.extractAllTo(dotminecraft, true);  // true means overwrite files if they already exist
                        fs.unlinkSync(modFile);
                        fs.writeFileSync(configsDowloadedFileInfo, item.id, 'utf-8');
                        console.log("File saved successfully!");
                        setDownloading(false);
                    };
                });
            };

            reader.onerror = function () {
                setDownloading(false);
                console.error("Error reading the blob:", this.error);
            };

            reader.readAsArrayBuffer(blob);
        });
    };

    return <div className='centered'>
        <h1>Configs</h1>
        <p className='card-c'>Here you can update your configs files.</p>
        <div className="">
            <button className="btn btn-primary" onClick={handleUpdateClick}>{downloading ? <Downloadspinner /> : 'Refresh'}</button>
            {/* <button className={updated ? 'btn btn-success' : 'btn btn-secondary'}>Update resourcepacks</button> */}
        </div>
        <div className='grow'>
            <ul className='grow'>
                {configs && configs.latest ? configs.versions.map((item) => {
                    return <li key={item.id} className='listItem'>
                        {item.id}
                        <p className='grow textDesc'>{item.description}</p>

                        {downloaded === item.id
                            ? <button className='btn btn-secondary' onClick={() => { handleDownloadClick(item) }}>Downloaded</button>
                            : <button className='btn btn-success' onClick={() => { handleDownloadClick(item) }}>Download</button>}
                    </li>
                }) : handleUpdateClick()}
            </ul>
        </div>
    </div>
}

export default Configs;