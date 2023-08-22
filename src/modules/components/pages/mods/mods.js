import React, { useState } from 'react';
import axios from 'axios';
import Downloadspinner from '../../utils/Downloadspinner';

const fs = window.require('fs');
const os = window.require('os');
const path = window.require('path');
const AdmZip = window.require('adm-zip');

const dotminecraft = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
const tmodDirectory = `${dotminecraft}\\.tmods_loader`;
const tmodDirectoryMods = `${tmodDirectory}\\mods`;
const modDowloadedFileInfo = `${tmodDirectoryMods}\\downloaded.txt`;

function Mods() {
    const [downloading, setDownloading] = useState(false);
    const [mods, setMods] = useState({});

    function readAndCreateTmodFolder() {
        if (!fs.existsSync(tmodDirectory)) {
            fs.mkdirSync(tmodDirectory);
        }
        if (!fs.existsSync(tmodDirectoryMods)) {
            fs.mkdirSync(tmodDirectoryMods);
        }
        if (!fs.existsSync(modDowloadedFileInfo)) {
            fs.writeFileSync(modDowloadedFileInfo, '', 'utf-8');
        }
    }
    readAndCreateTmodFolder();
    
    const downloaded = fs.readFileSync(modDowloadedFileInfo, 'utf-8');

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

    function handleUpdateClick() {
        axios.get(window.tmodsconfig.MANIFEST_URL)
            .then(response => {
                setMods({ latest: response.data.latest.mods, versions: response.data.versions.mods });
            })
            .catch(error => {
                console.error("There was an error fetching the data:", error);
            });
    }

    function handleDownloadClick(item) {
        setDownloading(true);
        if (!fs.existsSync(tmodDirectoryMods)) {
            fs.mkdirSync(tmodDirectoryMods);
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
                const modFile = tmodDirectoryMods + '/mods.zip';
                fs.writeFile(modFile, buffer, (err) => {
                    if (err) {
                        setDownloading(false);
                        console.error("Error saving the file:", err);
                    } else {
                        const dotminecraftmods = dotminecraft + '\\mods';
                        const dotminecraftmods_back = dotminecraftmods + '_back';
                        if (fs.existsSync(dotminecraftmods)) {
                            // If it exists, check if backup directory already exists, if it does, remove it first
                            if (fs.existsSync(dotminecraftmods_back)) {
                                fs.rmdirSync(dotminecraftmods_back, { recursive: true, force: true }); // Using recursive and force to ensure deep deletion
                            }

                            copyDir(dotminecraftmods, dotminecraftmods_back)

                            // Remove the original directory
                            fs.rmdirSync(dotminecraftmods, { recursive: true, force: true }); // Using recursive and force to ensure deep deletion
                        }

                        const zip = new AdmZip(modFile);
                        zip.extractAllTo(dotminecraft, true);  // true means overwrite files if they already exist
                        fs.unlinkSync(modFile);
                        fs.writeFileSync(modDowloadedFileInfo, item.id, 'utf-8');
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
        <h1>Mods</h1>
        <p className='card-c'>Here you can enable and disable your mods and update them.</p>
        <div className="">
            <button className="btn btn-primary" onClick={handleUpdateClick}>{downloading ? <Downloadspinner /> : 'Refresh'}</button>
            {/* <button className={updated ? 'btn btn-success' : 'btn btn-secondary'}>Update mods</button> */}
        </div>
        <div className='grow'>
            <ul className='grow'>
                {mods && mods.latest ? mods.versions.map((item) => {
                    return <li key={item.id} className='listItem'>
                        <div className='versionsWrapper'>
                            <code>{item.id}</code>
                            <code>{item.target}</code>
                        </div>
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

export default Mods;