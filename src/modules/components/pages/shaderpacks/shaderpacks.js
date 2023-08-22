import React, { useState } from 'react';
import axios from 'axios';
import Downloadspinner from '../../utils/Downloadspinner';

const fs = window.require('fs');
const os = window.require('os');
const path = window.require('path');
const AdmZip = window.require('adm-zip');

const dotminecraft = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft');
const tmodDirectory = `${dotminecraft}\\.tmods_loader`;
const tmodDirectoryShaderpacks = `${tmodDirectory}\\shaderpacks`;
const shaderpacksDowloadedFileInfo = `${tmodDirectoryShaderpacks}\\downloaded.txt`;

function Shaderpacks() {
    const [downloading, setDownloading] = useState(false);
    const [shaderpacks, setShaderpacks] = useState({});

    function readAndCreateTmodFolder() {
        if (!fs.existsSync(tmodDirectory)) {
            fs.mkdirSync(tmodDirectory);
        }
        if (!fs.existsSync(tmodDirectoryShaderpacks)) {
            fs.mkdirSync(tmodDirectoryShaderpacks);
        }
        if (!fs.existsSync(shaderpacksDowloadedFileInfo)) {
            fs.writeFileSync(shaderpacksDowloadedFileInfo, '', 'utf-8');
        }
    }
    readAndCreateTmodFolder();
    
    const downloaded = fs.readFileSync(shaderpacksDowloadedFileInfo, 'utf-8');

    function handleUpdateClick() {
        axios.get(window.tmodsconfig.MANIFEST_URL)
            .then(response => {
                setShaderpacks({ latest: response.data.latest.shaderpacks, versions: response.data.versions.shaderpacks });
                console.log(response.data.latest.shaderpacks);
            })
            .catch(error => {
                console.error("There was an error fetching the data:", error);
            });
    }

    function handleDownloadClick(item) {
        setDownloading(true);
        if (!fs.existsSync(tmodDirectoryShaderpacks)) {
            fs.mkdirSync(tmodDirectoryShaderpacks);
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
                const modFile = tmodDirectoryShaderpacks + '/shaderpacks.zip';
                fs.writeFile(modFile, buffer, (err) => {
                    if (err) {
                        setDownloading(false);
                        console.error("Error saving the file:", err);
                    } else {
                        // const dotminecraftshaderpacks = dotminecraft + '\\shaderpacks';

                        const zip = new AdmZip(modFile);
                        zip.extractAllTo(dotminecraft, true);  // true means overwrite files if they already exist
                        fs.unlinkSync(modFile);
                        fs.writeFileSync(shaderpacksDowloadedFileInfo, item.id, 'utf-8');
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
        <h1>Shaderpacks</h1>
        <p className='card-c'>Here you can enable and disable your shaderpacks and update them.</p>
        <div className="">
            <button className="btn btn-primary" onClick={handleUpdateClick}>{downloading ? <Downloadspinner /> : 'Refresh'}</button>
            {/* <button className={updated ? 'btn btn-success' : 'btn btn-secondary'}>Update shaderpacks</button> */}
        </div>
        <div className='grow'>
            <ul className='grow'>
                {shaderpacks && shaderpacks.latest ? shaderpacks.versions.map((item) => {
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

export default Shaderpacks;