import './home.css';

function Home() {
    return <div className='centered'>
        <p className='card-c'>Here you can manage, download and update your minecraft content, feel free to explore the side elements</p>
        <p>Version {window.tmodsconfig.VERSION}</p>
    </div>
}

export default Home;