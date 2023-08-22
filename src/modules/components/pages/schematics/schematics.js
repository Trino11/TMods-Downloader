import React, { useState } from 'react';
import axios from 'axios';
import Downloadspinner from '../../utils/Downloadspinner';

const fs = window.require('fs');
const os = window.require('os');
const path = window.require('path');
const AdmZip = window.require('adm-zip');

const dotminecraft = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
const tmodDirectory = `${dotminecraft}\\.tmods_loader`;
const tmodDirectorySchematics = `${tmodDirectory}\\schematics`;
const schematicsDowloadedFileInfo = `${tmodDirectorySchematics}\\downloaded.txt`;

function Schematics() {
    const [downloading, setDownloading] = useState(false);
    const [schematics, setSchematics] = useState({});
    
    function readAndCreateTmodFolder() {
        if (!fs.existsSync(tmodDirectory)) {
            fs.mkdirSync(tmodDirectory);
        }
        if (!fs.existsSync(tmodDirectorySchematics)) {
            fs.mkdirSync(tmodDirectorySchematics);
        }
        if (!fs.existsSync(schematicsDowloadedFileInfo)) {
            fs.writeFileSync(schematicsDowloadedFileInfo, '', 'utf-8');
        }
    }
    readAndCreateTmodFolder();
    
    const downloaded = fs.readFileSync(schematicsDowloadedFileInfo, 'utf-8');

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
                setSchematics({ latest: response.data.latest.schematics, versions: response.data.versions.schematics });
            })
            .catch(error => {
                console.error("There was an error fetching the data:", error);
            });
    }

    function handleDownloadClick(item) {
        setDownloading(true);
        if (!fs.existsSync(tmodDirectorySchematics)) {
            fs.mkdirSync(tmodDirectorySchematics);
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
                const schematicsFile = tmodDirectorySchematics + '/schematics.zip';
                fs.writeFile(schematicsFile, buffer, (err) => {
                    if (err) {
                        setDownloading(false);
                        console.error("Error saving the file:", err);
                    } else {
                        const dotminecraftSchematics = dotminecraft + '\\schematics';
                        const dotminecraftSchematics_back = dotminecraftSchematics + '_back';
                        if (fs.existsSync(dotminecraftSchematics)) {
                            // If it exists, check if backup directory already exists, if it does, remove it first
                            if (fs.existsSync(dotminecraftSchematics_back)) {
                                fs.rmdirSync(dotminecraftSchematics_back, { recursive: true, force: true }); // Using recursive and force to ensure deep deletion
                            }

                            copyDir(dotminecraftSchematics, dotminecraftSchematics_back)

                            // Remove the original directory
                            fs.rmdirSync(dotminecraftSchematics, { recursive: true, force: true }); // Using recursive and force to ensure deep deletion
                        }

                        const zip = new AdmZip(schematicsFile);
                        zip.extractAllTo(dotminecraft, true);  // true means overwrite files if they already exist
                        fs.unlinkSync(schematicsFile);
                        fs.writeFileSync(schematicsDowloadedFileInfo, item.id, 'utf-8');
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
        <h1>Schematics</h1>
        <p className='card-c'>Here update your schematics.</p>
        <div className="">
            <button className="btn btn-primary" onClick={handleUpdateClick}>{downloading ? <Downloadspinner /> : 'Refresh'}</button>
            {/* <button className={updated ? 'btn btn-success' : 'btn btn-secondary'}>Update mods</button> */}
        </div>
        <div className='grow'>
            <ul className='grow'>
                {schematics && schematics.latest ? schematics.versions.map((item) => {
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

export default Schematics;